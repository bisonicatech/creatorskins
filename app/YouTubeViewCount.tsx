"use client";

import { useEffect, useState } from "react";
import { extractYouTubeId } from "@/lib/youtube";

export function YouTubeViewCount({ url }: { url: string }) {
  const [viewCount, setViewCount] = useState<number | null>(null);

  useEffect(() => {
    if (!extractYouTubeId(url)) return;
    fetch(`/api/youtube-views?url=${encodeURIComponent(url)}`)
      .then((res) => res.json())
      .then((body) => setViewCount(body.viewCount ?? null))
      .catch(() => setViewCount(null));
  }, [url]);

  if (!extractYouTubeId(url) || viewCount === null) return null;

  return <p className="mt-1 text-xs text-white/40">{viewCount.toLocaleString()} views on YouTube</p>;
}
