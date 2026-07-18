import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PUT(request: Request) {
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

    const { values } = (await request.json()) as { values: Record<string, string> };
    const entries = Object.entries(values ?? {});

    if (entries.length === 0) {
      return NextResponse.json({ error: "No values provided" }, { status: 400 });
    }

    // Every key is expected to already exist (seeded by the migration) — this only ever
    // edits existing rows, so plain per-key updates avoid needing `label` (not sent by
    // the form, and NOT NULL) to satisfy an insert path that should never actually run.
    for (const [key, value] of entries) {
      const { error } = await admin
        .from("site_content")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("key", key);

      if (error) {
        console.error("admin content route: update failed", key, error);
        return NextResponse.json({ error: "internal" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin content route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
