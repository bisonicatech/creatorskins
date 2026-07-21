"use client";

import { useEffect, useRef } from "react";
import { extractYouTubeId } from "@/lib/youtube";

type Platform = "youtube" | "tiktok" | "instagram" | "video" | null;

const VIDEO_FILE_EXTENSIONS = [".mp4", ".mov", ".webm", ".m4v"];

function detectPlatform(url: string): { platform: Platform; youtubeId?: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtube.com" || host === "youtu.be") {
      return { platform: "youtube", youtubeId: extractYouTubeId(url) ?? "" };
    }
    if (host === "tiktok.com") return { platform: "tiktok" };
    if (host === "instagram.com") return { platform: "instagram" };

    // Not a recognized social platform — if it looks like a direct video file
    // (e.g. hosted locally for testing, or self-hosted generally), play it
    // with a plain native player instead of showing nothing.
    if (VIDEO_FILE_EXTENSIONS.some((ext) => u.pathname.toLowerCase().endsWith(ext))) {
      return { platform: "video" };
    }
  } catch {
    // not a valid URL — treated as no embed below
  }
  return { platform: null };
}

function loadScriptOnce(src: string, onLoad?: () => void) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    onLoad?.();
    return;
  }
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  if (onLoad) script.onload = onLoad;
  document.body.appendChild(script);
}

// TikTok and Instagram's embed scripts convert a <blockquote> into their own
// iframe client-side (via oEmbed), and each script only scans the DOM for
// unconverted blockquotes on load — reprocessing has to be triggered manually
// for blockquotes added after the script already ran, which is the normal
// case in a React app. YouTube needs none of this — it's a plain iframe we
// fully control, so it's the only one of the three with predictable sizing;
// TikTok/Instagram embeds size themselves and won't perfectly match.
export function ReelEmbed({ url, size = "compact" }: { url: string; size?: "compact" | "large" }) {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { platform, youtubeId } = detectPlatform(url);

  // "compact" is sized for dense dashboard rows (name/rate/status sitting next to
  // the video) — "large" is for the public marketing homepage, where the video is
  // the main visual and should scale up substantially on bigger screens rather
  // than staying thumbnail-sized regardless of viewport.
  const sizeClass =
    size === "large"
      ? "w-full max-w-[340px] sm:max-w-[400px] md:max-w-[460px] lg:max-w-[560px] xl:max-w-[640px]"
      : "w-full max-w-[220px]";

  useEffect(() => {
    if (platform === "tiktok") {
      loadScriptOnce("https://www.tiktok.com/embed.js");
    }
    if (platform === "instagram") {
      loadScriptOnce("https://www.instagram.com/embed.js", () => {
        (window as any).instgrm?.Embeds?.process();
      });
      (window as any).instgrm?.Embeds?.process();
    }
  }, [platform, url]);

  // The muted *attribute* in JSX doesn't reliably sync to the actual .muted
  // *property* the browser checks at autoplay time — setting it here directly
  // on the element is the reliable fix, otherwise autoplay gets silently
  // blocked even though the video looks correctly muted in the markup.
  useEffect(() => {
    if (platform !== "video" || !videoRef.current) return;
    const el = videoRef.current;
    el.muted = true;
    el.play().catch(() => {
      // Autoplay can still be blocked by the browser (e.g. reduced-motion
      // settings, or a tab that isn't focused yet) — controls remain
      // available so the user can start playback manually either way.
    });
  }, [platform, url]);

  if (!url || !platform) return null;

  return (
    <div ref={ref} className={`${sizeClass} overflow-hidden border border-white/10 bg-surface`}>
      {platform === "youtube" && youtubeId && (
        <iframe
          // autoplay requires mute=1 (browsers block unmuted autoplay, same reason
          // as the native video fix above) — looping a single video on YouTube's
          // embed specifically requires playlist set to that same video's ID, not
          // just loop=1 alone, which is a real quirk of their embed API.
          src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&playsinline=1`}
          className="aspect-[9/16] w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="CreatorSkins reel"
        />
      )}
      {platform === "tiktok" && (
        <blockquote className="tiktok-embed" cite={url}>
          <section />
        </blockquote>
      )}
      {platform === "instagram" && (
        <blockquote className="instagram-media" data-instgrm-permalink={url} data-instgrm-version="14" />
      )}
      {platform === "video" && (
        <video
          ref={videoRef}
          controls
          loop
          playsInline
          src={url}
          className="aspect-[9/16] w-full"
        />
      )}
    </div>
  );
}
