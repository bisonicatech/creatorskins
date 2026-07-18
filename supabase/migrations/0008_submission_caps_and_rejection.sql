-- Protects a campaign's budget from one creator submitting unlimited videos:
-- a brand sets how many paid submissions per creator is acceptable for this
-- campaign (1 = one-and-done, higher = brands who want ongoing traction from
-- the same creator). Applied campaign-wide, not per creator-assignment.
alter table campaigns
add column max_submissions_per_creator integer not null default 1
  check (max_submissions_per_creator > 0);

-- Staff previously had no way to actually reject a submission — the status
-- existed and displayed correctly, but nothing could set it. A rejection
-- reason is required so the creator has something actionable to fix (and the
-- brand has a record of why budget wasn't spent on it).
alter table submissions
add column rejection_reason text;
