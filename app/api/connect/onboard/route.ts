import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: creator, error: creatorError } = await admin
      .from("creators")
      .select("id, display_name, stripe_account_id")
      .eq("user_id", user.id)
      .single();

    if (creatorError) {
      console.error("connect onboard route: creator lookup failed", creatorError);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    if (!creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });
    }

    let accountId = creator.stripe_account_id as string | null;

    if (!accountId) {
      // Accounts v2 — recipient configuration only (no merchant/card_payments,
      // this account never takes payments directly, only receives Transfers).
      // Country is hardcoded to GB to match the platform's GBP-only settlement
      // (see currency decision in project memory); revisit if non-UK creators
      // are ever onboarded.
      const account = await stripe.v2.core.accounts.create({
        contact_email: user.email,
        display_name: creator.display_name,
        dashboard: "express",
        identity: { country: "gb" },
        defaults: {
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
      });
      accountId = account.id;

      await admin.from("creators").update({ stripe_account_id: accountId }).eq("id", creator.id);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/dashboard`,
      return_url: `${appUrl}/dashboard`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    console.error("connect onboard route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
