import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
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

    const { error } = await admin
      .from("creator_channels")
      .delete()
      .eq("id", params.id)
      .eq("creator_id", creator.id);

    if (error) {
      console.error("creator-channels delete route: failed", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("creator-channels delete route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
