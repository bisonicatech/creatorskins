import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { extractYouTubeId } from "@/lib/youtube";

// Real view counts for a submitted YouTube video, via the public Data API v3 —
// no OAuth needed, since YouTube exposes view counts for any public video with
// just an API key. TikTok/Instagram don't have an equivalent clean path (see
// the Phase 2 memory notes on why), so this is deliberately YouTube-only for
// now. Requires auth (not staff-only) so any signed-in user can't be used as
// an open proxy to burn this app's YouTube API quota, but any logged-in
// brand/creator/staff can see it, not just staff.
export async function GET(request: Request) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return NextResponse.json({ viewCount: null });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.error("youtube-views route: YOUTUBE_API_KEY not set");
      return NextResponse.json({ viewCount: null });
    }

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}&key=${apiKey}`
    );

    if (!res.ok) {
      console.error("youtube-views route: YouTube API request failed", res.status);
      return NextResponse.json({ viewCount: null });
    }

    const body = await res.json();
    const rawCount = body.items?.[0]?.statistics?.viewCount;

    return NextResponse.json({ viewCount: rawCount ? Number(rawCount) : null });
  } catch (err) {
    console.error("youtube-views route error:", err);
    return NextResponse.json({ viewCount: null });
  }
}
