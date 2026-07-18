-- Lets a creator register the channels they publish on (no OAuth — just a
-- self-reported handle/URL). This is purely informational/discovery data —
-- money safety never depends on it, since payout release already requires
-- staff to verify the actual submitted content URL contains the real brand
-- content before releasing anything. A false channel claim here doesn't
-- create a fraud path, just inaccurate discovery data, so no ownership
-- verification is built for this. If verification is ever wanted later (a
-- trust signal for brands, not a money-safety requirement), a lightweight
-- identity-only OAuth per platform would prove it outright — a much smaller
-- ask than the insights-scope OAuth Phase 2's view-tracking needs, so it
-- could realistically ship well before that. See the Phase 2
-- view-triggered-payout memory for that distinction.
create table creator_channels (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram', 'other')),
  handle_or_url text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table creator_channels enable row level security;

-- Mutations go through /api/creator-channels using the service-role client
-- after an explicit session check, same pattern as every other privileged
-- write in this app — but a creator-scoped policy is still added here for
-- defense in depth, consistent with every other table in this schema.
create policy "creators manage own channels" on creator_channels
  for all using (creator_id in (select id from creators where user_id = auth.uid()));
