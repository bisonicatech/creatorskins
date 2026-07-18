import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Separate endpoint for Stripe's v2 "thin events" (Event Destinations), distinct
// from the v1 snapshot-event webhook at /api/stripe/webhook. Thin events only
// carry a reference to the changed object, not its data, so every event here
// requires a follow-up fetch — deliberately kept apart from the v1 handler since
// the payload shape and verification secret are both different.
//
// constructEvent (the v1 method) explicitly rejects v2 thin event payloads —
// parseEventNotification is the v2-specific equivalent.
export async function POST(request: Request) {
  const body = await request.text();
  const signature = headers().get("stripe-signature");

  let notification: any;
  try {
    notification = await (stripe as any).parseEventNotification(
      body,
      signature!,
      process.env.STRIPE_WEBHOOK_SECRET_V2!
    );
  } catch (err) {
    console.error("webhook-v2 signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // parseEventNotification's exact return shape isn't fully documented for
  // Node — handle both possibilities: the thin event body already having
  // related_object, or only an id that needs a follow-up fetch.
  let event = notification;
  if (!event?.related_object && event?.id) {
    try {
      event = await stripe.v2.core.events.retrieve(event.id);
    } catch (err) {
      console.error("webhook-v2: failed to fetch full event", err);
      return NextResponse.json({ received: true });
    }
  }

  if (event?.type === "v2.core.account.updated") {
    const accountId = event.related_object?.id;
    if (accountId) {
      try {
        const account = await stripe.v2.core.accounts.retrieve(accountId, {
          include: ["configuration.recipient"],
        });
        const transfersStatus = (account as any).configuration?.recipient?.capabilities?.stripe_balance
          ?.stripe_transfers?.status;

        const admin = createAdminClient();
        await admin
          .from("creators")
          .update({
            stripe_onboarding_complete: transfersStatus === "active" || transfersStatus === "pending",
            stripe_payouts_enabled: transfersStatus === "active",
          })
          .eq("stripe_account_id", accountId);
      } catch (err) {
        console.error("webhook-v2: failed to process v2.core.account.updated", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
