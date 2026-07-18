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
    const { data: staff } = await admin.from("staff").select("user_id").eq("user_id", user.id).maybeSingle();

    if (!staff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: campaignRequest } = await admin
      .from("campaign_requests")
      .select("id, campaign_id, creator_id, status, campaigns(rate_per_creator)")
      .eq("id", params.id)
      .single();

    if (!campaignRequest || campaignRequest.status !== "pending") {
      return NextResponse.json({ error: "Request not found or already decided" }, { status: 404 });
    }

    const rate = (campaignRequest.campaigns as any)?.rate_per_creator;
    if (!rate) {
      return NextResponse.json({ error: "Campaign has no rate set" }, { status: 409 });
    }

    const { error: assignError } = await admin.from("campaign_creators").insert({
      campaign_id: campaignRequest.campaign_id,
      creator_id: campaignRequest.creator_id,
      agreed_amount: rate,
    });

    if (assignError && assignError.code !== "23505") {
      console.error("approve request route: assignment failed", assignError);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    const { data: updated, error } = await admin
      .from("campaign_requests")
      .update({ status: "approved", decided_at: new Date().toISOString() })
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      console.error("approve request route error:", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    return NextResponse.json({ request: updated });
  } catch (err) {
    console.error("approve request route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
