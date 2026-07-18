// Fixed platform-wide window after verification during which a brand can flag
// verified content before payout — a business/trust policy, not something
// brands tune per campaign. Kept as one constant rather than a per-campaign
// field for now, per the "hopefully these issues don't crop up too often"
// framing this was scoped under.
export const PAYOUT_HOLD_HOURS = 48;

export function holdWindowPassed(verifiedAt: string | null): boolean {
  if (!verifiedAt) return false;
  const deadline = new Date(verifiedAt).getTime() + PAYOUT_HOLD_HOURS * 60 * 60 * 1000;
  return Date.now() >= deadline;
}

export function holdWindowDeadline(verifiedAt: string): string {
  return new Date(new Date(verifiedAt).getTime() + PAYOUT_HOLD_HOURS * 60 * 60 * 1000).toISOString();
}
