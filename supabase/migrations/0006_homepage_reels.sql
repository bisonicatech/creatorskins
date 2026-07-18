-- Three optional homepage reel embed slots, added to the same site_content
-- key/value store from 0005. Empty by default — the homepage skips any slot
-- (and hides the whole reels section if all three are empty) rather than
-- rendering a broken embed. Accepts a YouTube Shorts, TikTok, or Instagram
-- Reels URL; the platform is auto-detected client-side from the URL itself.
insert into site_content (key, value, label) values
  ('reel_1_url', '', 'Reel 1 — YouTube Shorts, TikTok, or Instagram Reel URL (leave blank to hide)'),
  ('reel_2_url', '', 'Reel 2 — YouTube Shorts, TikTok, or Instagram Reel URL (leave blank to hide)'),
  ('reel_3_url', '', 'Reel 3 — YouTube Shorts, TikTok, or Instagram Reel URL (leave blank to hide)')
on conflict (key) do nothing;
