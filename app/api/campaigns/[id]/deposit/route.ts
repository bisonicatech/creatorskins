import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: campaign, error: campaignError } = await admin
      .from("campaigns")
      .select("id, title, budget_amount, currency, status, brands!inner(id, user_id, stripe_customer_id)")
      .eq("id", params.id)
      .single();

    if (campaignError) {
      console.error("deposit route: campaign lookup failed", campaignError);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    // Supabase's client infers a joined relation like `brands` as an array type
    // without generated types, even though `!inner` + `.single()` guarantee it's
    // actually one object at runtime — cast once here rather than at every access.
    const brand = campaign?.brands as unknown as { id: string; user_id: string; stripe_customer_id: string | null };

    if (!campaign || brand.user_id !== user.id) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const { topUpAmount } = (await request.json().catch(() => ({}))) as { topUpAmount?: number };

    let chargeAmount: number;
    if (campaign.status === "draft") {
      chargeAmount = campaign.budget_amount;
    } else if (["funded", "active"].includes(campaign.status) && topUpAmount) {
      if (!Number.isInteger(topUpAmount) || topUpAmount <= 0) {
        return NextResponse.json({ error: "Invalid top-up amount" }, { status: 400 });
      }
      chargeAmount = topUpAmount;
    } else {
      return NextResponse.json({ error: "Campaign is not eligible for funding right now" }, { status: 409 });
    }

    let customerId = brand.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await admin.from("brands").update({ stripe_customer_id: customerId }).eq("id", brand.id);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      customer_update: { address: "auto" },
      billing_address_collection: "auto",
      automatic_tax: { enabled: true },
      line_items: [
        {
          price_data: {
            currency: campaign.currency,
            unit_amount: chargeAmount,
            product_data: {
              name:
                campaign.status === "draft"
                  ? `Escrow deposit — ${campaign.title}`
                  : `Escrow top-up — ${campaign.title}`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        transfer_group: `campaign_${campaign.id}`,
        metadata: { campaign_id: campaign.id },
      },
      metadata: { campaign_id: campaign.id },
      success_url: `${appUrl}/campaigns/${campaign.id}?deposit=success`,
      cancel_url: `${appUrl}/campaigns/${campaign.id}?deposit=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("deposit route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
