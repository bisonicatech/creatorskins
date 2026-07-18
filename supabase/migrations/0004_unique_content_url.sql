-- A creator submitting the same content link for two different campaigns
-- (or two creators submitting the identical link) would mean getting paid
-- twice for one piece of work. Enforced globally, not just per-creator.
alter table submissions
add constraint submissions_content_url_unique unique (content_url);
