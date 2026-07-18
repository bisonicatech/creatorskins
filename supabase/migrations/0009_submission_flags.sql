-- Lets a brand flag a verified submission within a fixed post-verification
-- window (see PAYOUT_HOLD_HOURS in lib/payoutHold.ts) if something looks
-- off-brand, without giving the brand the ability to block payment outright —
-- that stays a staff decision (resolved via dismiss, or via the existing
-- reject-with-reason flow). This is deliberately not a new status: the
-- submission stays 'verified' the whole time, flagging/resolving are just
-- timestamps + a reason layered on top.
alter table submissions
add column flagged_at timestamptz,
add column flag_reason text,
add column flag_resolved_at timestamptz;
