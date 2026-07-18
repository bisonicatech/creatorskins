import { NextResponse } from "next/server";
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
    const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle();

    if (!creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 403 });
    }

    const { data: campaign } = await admin
      .from("campaigns")
      .select("id, rate_per_creator, status")
      .eq("id", params.id)
      .single();

    if (!campaign || campaign.rate_per_creator === null || !["funded", "active"].includes(campaign.status)) {
      return NextResponse.json({ error: "Campaign not open for requests" }, { status: 404 });
    }

    const { data: campaignRequest, error } = await admin
      .from("campaign_requests")
      .insert({ campaign_id: params.id, creator_id: creator.id })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "You've already requested this campaign" }, { status: 409 });
      }
      console.error("create campaign request route error:", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    return NextResponse.json({ request: campaignRequest });
  } catch (err) {
    console.error("create campaign request route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
