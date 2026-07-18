import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_PLATFORMS = ["youtube", "tiktok", "instagram", "other"];

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

    const { platform, handleOrUrl } = (await request.json()) as { platform: string; handleOrUrl: string };

    if (!ALLOWED_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    if (!handleOrUrl || !handleOrUrl.trim()) {
      return NextResponse.json({ error: "Enter a handle or URL" }, { status: 400 });
    }

    const { data: channel, error } = await admin
      .from("creator_channels")
      .insert({ creator_id: creator.id, platform, handle_or_url: handleOrUrl.trim() })
      .select()
      .single();

    if (error) {
      console.error("creator-channels route: insert failed", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    return NextResponse.json({ channel });
  } catch (err) {
    console.error("creator-channels route error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
