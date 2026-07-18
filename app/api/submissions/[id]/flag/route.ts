import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { holdWindowPassed } from "@/lib/payoutHold";

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
    const { data: submission } = await admin
      .from("submissions")
      .select("id, campaign_id, status, verified_at, flagged_at")
      .eq("id", params.id)
      .maybeSingle();

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const { data: campaign } = await admin
      .from("campaigns")
      .select("id, brands!inner(user_id)")
      .eq("id", submission.campaign_id)
      .single();

    if (!campaign || (campaign.brands as any).user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (submission.status !== "verified") {
      return NextResponse.json({ error: "Only approved content can be flagged" }, { status: 409 });
    }

    if (submission.flagged_at) {
      return NextResponse.json({ error: "This submission has already been flagged" }, { status: 409 });
    }

    if (holdWindowPassed(submission.verified_at)) {
      return NextResponse.json({ error: "The review window for this submission has closed" }, { status: 409 });
    }

    const { reason } = (await request.json().catch(() => ({}))) as { reason?: string };

    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: "A reason is required to flag content" }, { status: 400 });
    }

    const { data: updated, error } = await admin
      .from("submissions")
      .update({ flagged_at: new Date().toISOString(), flag_reason: reason.trim() })
      .eq("id", params.id)
      .select()
      .single();

    if (error || !updated) {
      console.error("flag submission route: update failed", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    return NextResponse.json({ submission: updated });
  } catch (err) {
    console.error("flag submission route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
