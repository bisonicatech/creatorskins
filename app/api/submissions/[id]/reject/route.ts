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

    const { reason } = (await request.json().catch(() => ({}))) as { reason?: string };

    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
    }

    const { data: existing } = await admin
      .from("submissions")
      .select("flagged_at, flag_resolved_at")
      .eq("id", params.id)
      .maybeSingle();

    const hasOpenFlag = Boolean(existing?.flagged_at) && !existing?.flag_resolved_at;

    // Rejects from either pending (staff's normal first-look decision) or verified
    // (staff reverses an earlier verify — e.g. resolving a brand flag) — either
    // starting state ends up rejected with a reason, never touching a submission
    // that's already rejected or already paid out. If this submission had an open
    // brand flag, rejecting it is itself the resolution — close the flag out too
    // rather than leaving it dangling open on a now-rejected submission.
    const { data: submission, error } = await admin
      .from("submissions")
      .update({
        status: "rejected",
        rejection_reason: reason.trim(),
        ...(hasOpenFlag && { flag_resolved_at: new Date().toISOString() }),
      })
      .eq("id", params.id)
      .in("status", ["pending", "verified"])
      .select()
      .single();

    if (error || !submission) {
      return NextResponse.json({ error: "Submission not found or already resolved" }, { status: 404 });
    }

    return NextResponse.json({ submission });
  } catch (err) {
    console.error("reject submission route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
