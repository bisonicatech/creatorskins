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

    const { data: updated, error } = await admin
      .from("campaign_requests")
      .update({ status: "denied", decided_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("status", "pending")
      .select()
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: "Request not found or already decided" }, { status: 404 });
    }

    return NextResponse.json({ request: updated });
  } catch (err) {
    console.error("deny request route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
