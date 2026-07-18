-- A brand assigns a creator to a campaign at an agreed rate. One row per
-- (campaign, creator) pair. This is the missing link submissions/payouts
-- already assumed existed but had no way to create outside raw SQL.
create table campaign_creators (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  agreed_amount integer not null check (agreed_amount > 0),
  created_at timestamptz not null default now(),
  unique (campaign_id, creator_id)
);

-- Metadata for overlay files a brand uploads to a campaign. The actual file
-- bytes live in Supabase Storage (bucket 'campaign-assets', created below);
-- this table just tracks what's there and where.
create table campaign_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes integer,
  created_at timestamptz not null default now()
);

alter table campaign_creators enable row level security;
alter table campaign_assets enable row level security;

-- These policies only govern direct client-side reads with the anon key +
-- user session. All privileged cross-user access (e.g. staff, or generating
-- signed download URLs) goes through API routes using the service-role
-- client instead, same pattern as the rest of this app.

create policy "brands manage own campaign assignments" on campaign_creators
  for all using (
    campaign_id in (select id from campaigns where brand_id in (select id from brands where user_id = auth.uid()))
  );

create policy "creators view own assignments" on campaign_creators
  for select using (creator_id in (select id from creators where user_id = auth.uid()));

create policy "brands manage own campaign assets" on campaign_assets
  for all using (
    campaign_id in (select id from campaigns where brand_id in (select id from brands where user_id = auth.uid()))
  );

create policy "assigned creators view campaign assets" on campaign_assets
  for select using (
    campaign_id in (
      select campaign_id from campaign_creators where creator_id in (select id from creators where user_id = auth.uid())
    )
  );

-- auth.users isn't reachable through the regular Supabase client, so brands
-- looking up a creator by email need a database-side helper. security definer
-- is safe here because this is only ever called via the service-role client
-- from a route that has already checked the caller owns the campaign.
create or replace function get_creator_id_by_email(p_email text)
returns uuid
language sql
security definer
as $$
  select c.id from creators c
  join auth.users u on u.id = c.user_id
  where u.email = p_email
  limit 1;
$$;

-- Private bucket for overlay assets — no public policies at all. Every read
-- and write is mediated by API routes using the service-role client after an
-- explicit authorization check, rather than relying on Storage RLS policies.
insert into storage.buckets (id, name, public)
values ('campaign-assets', 'campaign-assets', false)
on conflict (id) do nothing;
