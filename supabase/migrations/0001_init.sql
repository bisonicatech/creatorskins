-- Brands (buyers who fund campaigns)
create table brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  stripe_customer_id text,
  created_at timestamptz not null default now()
);
create unique index brands_user_id_idx on brands(user_id);

-- Creators (payees, onboarded via Stripe Connect Express)
create table creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  stripe_account_id text,
  stripe_onboarding_complete boolean not null default false,
  stripe_payouts_enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index creators_user_id_idx on creators(user_id);

-- Internal ops users allowed to verify submissions and release payouts
create table staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Campaigns brands fund; escrow_balance is the ledger-tracked amount still held
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  title text not null,
  budget_amount integer not null check (budget_amount > 0),
  escrow_balance integer not null default 0,
  currency text not null default 'gbp',
  status text not null default 'draft' check (status in ('draft', 'funded', 'active', 'completed')),
  created_at timestamptz not null default now()
);

-- Append-only ledger of money moving into the platform's Stripe balance per campaign
create table escrow_transactions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  type text not null check (type in ('deposit', 'refund')),
  amount integer not null,
  currency text not null,
  stripe_payment_intent_id text unique,
  status text not null default 'held' check (status in ('held', 'refunded')),
  created_at timestamptz not null default now()
);

-- A creator's deliverable against a campaign, with the gross amount agreed for it
create table submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  content_url text,
  agreed_amount integer not null check (agreed_amount > 0),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- One payout per submission; commission_amount + creator_amount = gross_amount
create table payouts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references submissions(id) on delete cascade,
  creator_id uuid not null references creators(id),
  campaign_id uuid not null references campaigns(id),
  gross_amount integer not null,
  commission_amount integer not null,
  creator_amount integer not null,
  stripe_transfer_id text unique,
  status text not null default 'pending' check (status in ('processing', 'pending', 'paid', 'failed')),
  created_at timestamptz not null default now()
);

-- Atomic balance adjustments so concurrent webhooks/payouts can't race a read-modify-write
create or replace function increment_escrow_balance(p_campaign_id uuid, p_amount integer)
returns void language sql as $$
  update campaigns set escrow_balance = escrow_balance + p_amount where id = p_campaign_id;
$$;

create or replace function decrement_escrow_balance(p_campaign_id uuid, p_amount integer)
returns void language sql as $$
  update campaigns set escrow_balance = escrow_balance - p_amount where id = p_campaign_id;
$$;

alter table brands enable row level security;
alter table creators enable row level security;
alter table campaigns enable row level security;
alter table escrow_transactions enable row level security;
alter table submissions enable row level security;
alter table payouts enable row level security;

-- Server routes use the service-role client and bypass RLS entirely.
-- These policies only govern direct client-side reads with the anon key + user session.

create policy "brands manage own row" on brands
  for all using (auth.uid() = user_id);

create policy "creators manage own row" on creators
  for all using (auth.uid() = user_id);

create policy "brands view own campaigns" on campaigns
  for select using (brand_id in (select id from brands where user_id = auth.uid()));

create policy "brands insert own campaigns" on campaigns
  for insert with check (brand_id in (select id from brands where user_id = auth.uid()));

create policy "brands view own escrow transactions" on escrow_transactions
  for select using (
    campaign_id in (
      select id from campaigns where brand_id in (select id from brands where user_id = auth.uid())
    )
  );

create policy "creators and owning brands view submissions" on submissions
  for select using (
    creator_id in (select id from creators where user_id = auth.uid())
    or campaign_id in (
      select id from campaigns where brand_id in (select id from brands where user_id = auth.uid())
    )
  );

create policy "creators view own payouts" on payouts
  for select using (creator_id in (select id from creators where user_id = auth.uid()));
