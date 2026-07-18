import { stripe } from "@/lib/stripe";

// Shared with the account.updated webhook handler and the payout-release
// self-heal check — all three call sites need the same answer to "is this
// v2 recipient account actually ready to receive transfers right now,
// according to Stripe itself." Re-fetches rather than trusting any cached
// snapshot; the `include` param is required or `configuration` silently
// comes back null even for a fully onboarded account.
export async function resolveConnectStatus(
  accountId: string
): Promise<{ onboardingComplete: boolean; payoutsEnabled: boolean }> {
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.recipient"],
  });
  const transfersStatus = (account as any).configuration?.recipient?.capabilities?.stripe_balance
    ?.stripe_transfers?.status;

  return {
    onboardingComplete: transfersStatus === "active" || transfersStatus === "pending",
    payoutsEnabled: transfersStatus === "active",
  };
}
