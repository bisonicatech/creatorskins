import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle();

    if (!creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 403 });
    }

    // Cross-user visibility (any creator sees any open campaign) is intentional
    // here, unlike asset access — this is discovery, not the assigned content
    // itself. Uses the admin client since RLS doesn't grant creators broad
    // read access to the campaigns table.
    const { data: campaigns } = await admin
      .from("campaigns")
      .select("id, title, budget_amount, rate_per_creator, currency, status")
      .not("rate_per_creator", "is", null)
      .in("status", ["funded", "active"])
      .order("created_at", { ascending: false });

    const campaignIds = (campaigns ?? []).map((c) => c.id);

    const [{ data: requests }, { data: assignments }] = await Promise.all([
      campaignIds.length > 0
        ? admin
            .from("campaign_requests")
            .select("campaign_id, status")
            .eq("creator_id", creator.id)
            .in("campaign_id", campaignIds)
        : Promise.resolve({ data: [] }),
      campaignIds.length > 0
        ? admin.from("campaign_creators").select("campaign_id").eq("creator_id", creator.id).in("campaign_id", campaignIds)
        : Promise.resolve({ data: [] }),
    ]);

    const result = (campaigns ?? []).map((c) => {
      const assigned = (assignments ?? []).some((a) => a.campaign_id === c.id);
      const request = (requests ?? []).find((r) => r.campaign_id === c.id);
      return {
        id: c.id,
        title: c.title,
        budgetAmount: c.budget_amount,
        ratePerCreator: c.rate_per_creator,
        currency: c.currency,
        requestStatus: assigned ? "assigned" : request?.status ?? null,
      };
    });

    return NextResponse.json({ campaigns: result });
  } catch (err) {
    console.error("open campaigns route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
