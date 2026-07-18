import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle();

    if (!creator) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 403 });
    }

    const { campaignId, contentUrl } = (await request.json()) as { campaignId: string; contentUrl: string };

    const { data: assignment } = await admin
      .from("campaign_creators")
      .select("agreed_amount")
      .eq("campaign_id", campaignId)
      .eq("creator_id", creator.id)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json({ error: "You're not assigned to this campaign" }, { status: 403 });
    }

    const { data: submission, error } = await admin
      .from("submissions")
      .insert({
        campaign_id: campaignId,
        creator_id: creator.id,
        content_url: contentUrl,
        agreed_amount: assignment.agreed_amount,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "This content link has already been submitted" }, { status: 409 });
      }
      console.error("create submission route error:", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    return NextResponse.json({ submission });
  } catch (err) {
    console.error("create submission route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
