import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveConnectStatus } from "@/lib/connectAccountStatus";

// Proactive counterpart to the self-heal check in /api/payouts/release: that
// one only catches a stale Connect status at the moment someone actually
// tries to pay a creator. This walks every creator who isn't yet fully
// green and re-syncs from Stripe directly, so staff see accurate status on
// the dashboard before a payout is ever attempted. Meant to be triggered on
// a schedule (see README), not called directly by the app.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Only rechecks accounts that aren't already fully green — a creator who's
  // already payouts_enabled won't spontaneously become un-onboarded, so
  // there's no need to burn a Stripe API call on every account, every run.
  const { data: creators, error } = await admin
    .from("creators")
    .select("id, stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled")
    .not("stripe_account_id", "is", null)
    .or("stripe_onboarding_complete.eq.false,stripe_payouts_enabled.eq.false");

  if (error) {
    console.error("reconcile-connect-accounts: creators lookup failed", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  let checked = 0;
  let updated = 0;
  const failures: string[] = [];

  for (const creator of creators ?? []) {
    checked++;
    try {
      const resolved = await resolveConnectStatus(creator.stripe_account_id as string);
      if (
        resolved.onboardingComplete !== creator.stripe_onboarding_complete ||
        resolved.payoutsEnabled !== creator.stripe_payouts_enabled
      ) {
        await admin
          .from("creators")
          .update({
            stripe_onboarding_complete: resolved.onboardingComplete,
            stripe_payouts_enabled: resolved.payoutsEnabled,
          })
          .eq("id", creator.id);
        updated++;
      }
    } catch (err) {
      console.error(`reconcile-connect-accounts: failed for creator ${creator.id}`, err);
      failures.push(creator.id);
    }
  }

  return NextResponse.json({ checked, updated, failures });
}
