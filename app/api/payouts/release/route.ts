import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { splitPayout } from "@/lib/commission";
import { resend } from "@/lib/resend";
import { resolveConnectStatus } from "@/lib/connectAccountStatus";
import { holdWindowPassed } from "@/lib/payoutHold";

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: staff } = await admin.from("staff").select("user_id").eq("user_id", user.id).maybeSingle();

    if (!staff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { submissionId } = (await request.json()) as { submissionId: string };

    const { data: submission, error: submissionError } = await admin
      .from("submissions")
      .select(
        "id, status, campaign_id, creator_id, agreed_amount, verified_at, flagged_at, flag_resolved_at, campaigns(currency, escrow_balance, max_submissions_per_creator), creators(stripe_account_id, stripe_payouts_enabled)"
      )
      .eq("id", submissionId)
      .single();

    if (submissionError) {
      console.error("payout release route: submission lookup failed", submissionError);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (submission.status !== "verified") {
      return NextResponse.json({ error: "Submission is not verified" }, { status: 409 });
    }

    // Brands get a fixed window after verification to flag something off-brand before
    // payout actually goes out (see lib/payoutHold.ts) — an open, unresolved flag blocks
    // release outright regardless of how much time has passed, since staff haven't yet
    // decided the outcome. With no flag at all, release still waits out the full window,
    // since the brand may not have flagged *yet*. Once a flag is resolved (dismissed, or
    // the submission was rejected instead), release no longer waits on the remainder of
    // the window — the concern has already been looked at and settled.
    if (submission.flagged_at && !submission.flag_resolved_at) {
      return NextResponse.json(
        { error: "This submission has an open flag from the brand that needs to be resolved before payout" },
        { status: 409 }
      );
    }

    if (!submission.flagged_at && !holdWindowPassed(submission.verified_at)) {
      return NextResponse.json(
        { error: "This submission is still within the brand's review window — try again later" },
        { status: 409 }
      );
    }

    // The unique constraint on payouts.submission_id only stops double-paying the *same*
    // submission — it does nothing to stop a creator submitting multiple different pieces
    // of content against one campaign assignment and being paid the full agreed_amount for
    // each one separately. agreed_amount is a single fixed rate per (campaign, creator), not
    // a per-video rate, so unlimited payouts to the same creator on the same campaign would be
    // a real over-payment risk. Brands set how many paid submissions per creator they're happy
    // with via campaigns.max_submissions_per_creator (default 1) — count existing payouts for
    // this creator+campaign and block once that cap is reached. Submissions themselves stay
    // uncapped (a creator can still resubmit after a rejection) — payout is the money boundary.
    const { data: existingPayouts } = await admin
      .from("payouts")
      .select("id")
      .eq("campaign_id", submission.campaign_id)
      .eq("creator_id", submission.creator_id);

    if ((existingPayouts?.length ?? 0) >= submission.campaigns.max_submissions_per_creator) {
      return NextResponse.json(
        {
          error: `This creator has already reached the ${submission.campaigns.max_submissions_per_creator}-payout limit for this campaign`,
        },
        { status: 409 }
      );
    }

    if (!submission.creators.stripe_account_id) {
      return NextResponse.json({ error: "Creator has not completed payout onboarding" }, { status: 409 });
    }

    let payoutsEnabled = submission.creators.stripe_payouts_enabled;
    if (!payoutsEnabled) {
      // Supabase's cached status is only as fresh as the last account.updated webhook we
      // actually received and processed — that can lag or, as observed during testing, miss
      // entirely. Before hard-blocking a real release, check Stripe directly (same v2 lookup
      // the webhook itself uses) and self-heal the cached row if it's actually ready.
      try {
        const resolved = await resolveConnectStatus(submission.creators.stripe_account_id);
        payoutsEnabled = resolved.payoutsEnabled;
        if (payoutsEnabled) {
          await admin
            .from("creators")
            .update({ stripe_onboarding_complete: true, stripe_payouts_enabled: true })
            .eq("id", submission.creator_id);
        }
      } catch (err) {
        console.error("payout release route: live Stripe status recheck failed", err);
      }
    }

    if (!payoutsEnabled) {
      return NextResponse.json({ error: "Creator has not completed payout onboarding" }, { status: 409 });
    }

    if (submission.campaigns.escrow_balance < submission.agreed_amount) {
      return NextResponse.json(
        { error: "Insufficient escrow balance for this payout — the campaign has been over-assigned" },
        { status: 409 }
      );
    }

    const { commissionAmount, creatorAmount } = splitPayout(submission.agreed_amount);
    const currency = submission.campaigns.currency;

    // Claim the payout via the unique constraint on submission_id before touching Stripe,
    // so two concurrent release calls can't both create a Transfer for the same submission.
    const { data: claimed, error: claimError } = await admin
      .from("payouts")
      .insert({
        submission_id: submissionId,
        creator_id: submission.creator_id,
        campaign_id: submission.campaign_id,
        gross_amount: submission.agreed_amount,
        commission_amount: commissionAmount,
        creator_amount: creatorAmount,
        status: "processing",
      })
      .select()
      .single();

    if (claimError || !claimed) {
      return NextResponse.json({ error: "Payout already issued for this submission" }, { status: 409 });
    }

    let transfer;
    try {
      transfer = await stripe.transfers.create({
        amount: creatorAmount,
        currency,
        destination: submission.creators.stripe_account_id,
        transfer_group: `campaign_${submission.campaign_id}`,
        metadata: { submission_id: submissionId, campaign_id: submission.campaign_id },
      });
    } catch (err) {
      await admin.from("payouts").delete().eq("id", claimed.id);
      throw err;
    }

    const { data: payout } = await admin
      .from("payouts")
      .update({ stripe_transfer_id: transfer.id, status: "pending" })
      .eq("id", claimed.id)
      .select()
      .single();

    await admin.rpc("decrement_escrow_balance", {
      p_campaign_id: submission.campaign_id,
      p_amount: submission.agreed_amount,
    });

    const { data: creatorRow } = await admin
      .from("creators")
      .select("display_name, user_id")
      .eq("id", submission.creator_id)
      .single();

    const { data: authUser } = await admin.auth.admin.getUserById(creatorRow!.user_id);

    if (authUser?.user?.email) {
      await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: authUser.user.email,
        subject: "Your CreatorSkins payout is on its way",
        html: `<p>Hi ${creatorRow?.display_name},</p><p>A payout of ${(creatorAmount / 100).toFixed(
          2
        )} ${currency.toUpperCase()} has been sent to your connected Stripe account.</p>`,
      });
    }

    return NextResponse.json({ payout });
  } catch (err) {
    console.error("payout release route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
