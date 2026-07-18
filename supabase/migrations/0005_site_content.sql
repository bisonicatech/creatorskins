-- Basic content-management store for landing page copy. Flat key/value pairs
-- rather than JSON arrays for list fields (e.g. brand_benefit_1..4) so the
-- admin form is just plain text inputs, no list-editor UI needed.
create table site_content (
  key text primary key,
  value text not null,
  label text not null,
  updated_at timestamptz not null default now()
);

alter table site_content enable row level security;

-- Landing page copy is already public by definition — anyone can read it.
create policy "anyone can read site content" on site_content
  for select using (true);

-- Writes go through /api/admin/content using the service-role client after
-- an explicit staff check in code, same pattern as every other privileged
-- mutation in this app — no direct client-side writes, so no write policy.

insert into site_content (key, value, label) values
  ('hero_eyebrow', 'Brand-funded video overlay platform', 'Hero eyebrow tag'),
  ('hero_strapline', 'Real Brands, Reel Payments', 'Hero strapline (bold, under the CreatorSkins logo)'),
  ('hero_subheading', 'Brands fund campaigns, creators publish, verified work gets paid out automatically.', 'Hero subheading paragraph'),
  ('hero_cta_primary', 'Get started', 'Hero primary button label'),
  ('hero_cta_secondary', 'Log in', 'Hero secondary button label'),

  ('brand_heading', 'For Brands', 'Brand column heading'),
  ('brand_benefit_1', 'Funds held safely in escrow until work is verified', 'Brand benefit 1'),
  ('brand_benefit_2', 'Pay by card, or by invoice with NET-30 terms', 'Brand benefit 2'),
  ('brand_benefit_3', 'Choose your own creators and agree rates upfront', 'Brand benefit 3'),
  ('brand_benefit_4', 'Track every creator''s content and payment status in one place', 'Brand benefit 4'),
  ('brand_step_1', 'Fund a campaign', 'Brand step 1'),
  ('brand_step_2', 'Assign a creator at an agreed rate', 'Brand step 2'),
  ('brand_step_3', 'Review submitted content', 'Brand step 3'),
  ('brand_step_4', 'Our team verifies it, then payout releases automatically', 'Brand step 4'),
  ('brand_cta', 'Get started as a brand', 'Brand column button label'),

  ('creator_heading', 'For Creators', 'Creator column heading'),
  ('creator_benefit_1', 'Budget is already secured before you start work', 'Creator benefit 1'),
  ('creator_benefit_2', 'Get paid once your work is verified — no chasing invoices', 'Creator benefit 2'),
  ('creator_benefit_3', 'Payouts go straight to your bank via Stripe', 'Creator benefit 3'),
  ('creator_benefit_4', 'Keep 82.5% of the agreed rate', 'Creator benefit 4'),
  ('creator_step_1', 'Get assigned to a campaign', 'Creator step 1'),
  ('creator_step_2', 'Download the overlay assets', 'Creator step 2'),
  ('creator_step_3', 'Publish your content and submit for review', 'Creator step 3'),
  ('creator_step_4', 'Get paid automatically once verified', 'Creator step 4'),
  ('creator_cta', 'Get started as a creator', 'Creator column button label')
on conflict (key) do nothing;
