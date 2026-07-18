import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveConnectStatus } from "@/lib/connectAccountStatus";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function POST(request: Request) {
  const body = await request.text();
  const signature = headers().get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // completed can fire before payment actually clears for delayed methods
      // (Bacs/ACH/SEPA direct debit) — payment_status distinguishes "paid" from
      // "processing", and async_payment_succeeded is what confirms delayed methods.
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "unpaid") break;
      const campaignId = session.metadata?.campaign_id;
      if (campaignId) {
        await fundCampaign(
          admin,
          campaignId,
          session.amount_total ?? 0,
          session.currency ?? "gbp",
          session.payment_intent as string
        );
      }
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const campaignId = invoice.metadata?.campaign_id;
      if (campaignId) {
        // `payment_intent` isn't in this SDK version's Invoice type for the pinned
        // API version, but it's still present on the actual payload — cast through
        // `any` rather than guess at a renamed field and silently change behavior.
        await fundCampaign(
          admin,
          campaignId,
          invoice.amount_paid,
          invoice.currency,
          (invoice as any).payment_intent as string
        );
      }
      break;
    }
    case "invoice_payment.paid": {
      // Newer event replacing/supplementing invoice.paid — the payload is an InvoicePayment,
      // which only references the invoice by id, so metadata has to be fetched separately.
      const invoicePayment = event.data.object as Stripe.InvoicePayment;
      const invoice = await stripe.invoices.retrieve(invoicePayment.invoice as string);
      const campaignId = invoice.metadata?.campaign_id;
      if (campaignId) {
        await fundCampaign(
          admin,
          campaignId,
          invoicePayment.amount_paid ?? 0,
          invoicePayment.currency,
          invoicePayment.payment.payment_intent as string
        );
      }
      break;
    }
    case "account.updated": {
      // Accounts created via the v2 API (see app/api/connect/onboard/route.ts) still
      // fire this classic v1 event when using dashboard:'express' — v2 thin events
      // (v2.core.account.updated) were not observed firing for this configuration
      // during testing, despite the account being v2-native.
      //
      // Re-fetch via the v2 API with an explicit `include` rather than trusting the
      // pushed v1 snapshot's shape — retrieve() without `include` silently returns
      // configuration as null even for v2-native accounts. Falls back to the
      // deprecated v1 boolean fields only if the v2 lookup fails (e.g. an account
      // that predates the v2 migration and isn't a v2 resource at all).
      const accountSnapshot = event.data.object as Stripe.Account;
      let onboardingComplete: boolean;
      let payoutsReady: boolean;

      try {
        const resolved = await resolveConnectStatus(accountSnapshot.id);
        onboardingComplete = resolved.onboardingComplete;
        payoutsReady = resolved.payoutsEnabled;
      } catch (err) {
        console.error("account.updated: v2 retrieve failed, falling back to v1 fields", err);
        onboardingComplete = Boolean(accountSnapshot.charges_enabled || accountSnapshot.payouts_enabled);
        payoutsReady = Boolean(accountSnapshot.payouts_enabled);
      }

      await admin
        .from("creators")
        .update({
          stripe_onboarding_complete: onboardingComplete,
          stripe_payouts_enabled: payoutsReady,
        })
        .eq("stripe_account_id", accountSnapshot.id);
      break;
    }
    case "transfer.created": {
      const transfer = event.data.object as Stripe.Transfer;
      await admin.from("payouts").update({ status: "paid" }).eq("stripe_transfer_id", transfer.id);
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function fundCampaign(
  admin: AdminClient,
  campaignId: string,
  amount: number,
  currency: string,
  paymentIntentId: string
) {
  const { data: existing } = await admin
    .from("escrow_transactions")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (existing) return;

  // The pre-check above isn't sufficient on its own: two webhook deliveries for the
  // same payment (e.g. checkout.session.completed and checkout.session.async_payment_succeeded
  // both firing for one delayed-payment-method checkout) can race each other, both pass
  // the check above, and both reach this insert. The unique constraint on
  // stripe_payment_intent_id then makes the second insert fail — but since that failure
  // was never checked here, execution used to continue straight into incrementing the
  // balance anyway, double-crediting escrow with only one ledger row to show for it.
  // Checking the error and bailing out here is what actually prevents that.
  const { error: insertError } = await admin.from("escrow_transactions").insert({
    campaign_id: campaignId,
    type: "deposit",
    amount,
    currency,
    stripe_payment_intent_id: paymentIntentId,
    status: "held",
  });

  if (insertError) {
    if (insertError.code === "23505") return;
    console.error("fundCampaign: escrow_transactions insert failed", insertError);
    return;
  }

  await admin.rpc("increment_escrow_balance", { p_campaign_id: campaignId, p_amount: amount });

  await admin.from("campaigns").update({ status: "funded" }).eq("id", campaignId).eq("status", "draft");
}
