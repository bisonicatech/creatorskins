import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: brand } = await admin.from("brands").select("id").eq("user_id", user.id).maybeSingle();

    if (!brand) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json({ creators: [] });
    }

    const { data: creators, error } = await admin
      .from("creators")
      .select("id, display_name, stripe_payouts_enabled")
      .ilike("display_name", `%${q}%`)
      .order("display_name")
      .limit(10);

    if (error) {
      console.error("creator search route error:", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    return NextResponse.json({ creators });
  } catch (err) {
    console.error("creator search route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
