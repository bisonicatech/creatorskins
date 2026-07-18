import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Dismisses an open brand flag so payout can proceed — staff have confirmed
// with the brand and creator that the content is fine after all. Rejecting a
// flagged submission instead goes through the existing /reject route, which
// also closes out the flag as part of that decision.
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

    const { data: submission, error } = await admin
      .from("submissions")
      .update({ flag_resolved_at: new Date().toISOString() })
      .eq("id", params.id)
      .not("flagged_at", "is", null)
      .is("flag_resolved_at", null)
      .select()
      .single();

    if (error || !submission) {
      return NextResponse.json({ error: "No open flag found for this submission" }, { status: 404 });
    }

    return NextResponse.json({ submission });
  } catch (err) {
    console.error("resolve-flag route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
