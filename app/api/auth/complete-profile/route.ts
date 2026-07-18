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

    const { role, name } = (await request.json()) as { role: "brand" | "creator"; name: string };

    if (role !== "brand" && role !== "creator") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const admin = createAdminClient();
    const table = role === "brand" ? "brands" : "creators";
    const nameField = role === "brand" ? "company_name" : "display_name";

    const { error } = await admin
      .from(table)
      .upsert({ user_id: user.id, [nameField]: name }, { onConflict: "user_id" });

    if (error) {
      console.error("complete-profile route error:", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("complete-profile route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
