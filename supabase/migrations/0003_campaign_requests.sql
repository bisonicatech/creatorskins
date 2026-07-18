-- The rate every approved creator gets paid on this campaign. Nullable so
-- existing campaigns aren't broken; a campaign only shows up for creators to
-- browse once a brand sets this.
alter table campaigns add column rate_per_creator integer;

-- A creator asks to work on a campaign; staff (CreatorSkins ops, not the
-- brand — brands are hands-off and agree criteria with CreatorSkins rather
-- than picking individual creators) approve or deny. Approval is what
-- creates the actual campaign_creators assignment, using the campaign's
-- rate_per_creator as the agreed_amount.
create table campaign_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (campaign_id, creator_id)
);

alter table campaign_requests enable row level security;

-- Staff approve/deny and creator-browse reads go through the service-role
-- client after an explicit check, same as everywhere else that needs
-- cross-user visibility. These policies only cover direct client-side reads.

create policy "creators manage own requests" on campaign_requests
  for all using (creator_id in (select id from creators where user_id = auth.uid()));

create policy "brands view requests on own campaigns" on campaign_requests
  for select using (
    campaign_id in (select id from campaigns where brand_id in (select id from brands where user_id = auth.uid()))
  );
