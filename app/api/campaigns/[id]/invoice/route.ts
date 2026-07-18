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
      console.error("invoice route: campaign lookup failed", campaignError);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    if (!campaign || campaign.brands.user_id !== user.id) {
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

    let customerId = campaign.brands.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await admin.from("brands").update({ stripe_customer_id: customerId }).eq("id", campaign.brands.id);
    }

    await stripe.invoiceItems.create({
      customer: customerId,
      currency: campaign.currency,
      amount: chargeAmount,
      description:
        campaign.status === "draft"
          ? `Escrow deposit — ${campaign.title}`
          : `Escrow top-up — ${campaign.title}`,
    });

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: 30,
      automatic_tax: { enabled: true },
      pending_invoice_items_behavior: "include",
      metadata: { campaign_id: campaign.id },
    });

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(invoice.id);

    return NextResponse.json({ invoiceUrl: finalized.hosted_invoice_url });
  } catch (err) {
    console.error("invoice route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
