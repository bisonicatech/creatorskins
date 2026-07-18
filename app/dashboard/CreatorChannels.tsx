"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Channel = {
  id: string;
  platform: "youtube" | "tiktok" | "instagram" | "other";
  handleOrUrl: string;
};

const PLATFORM_LABELS: Record<Channel["platform"], string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  other: "Other",
};

export function CreatorChannels({ channels }: { channels: Channel[] }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<Channel["platform"]>("youtube");
  const [handleOrUrl, setHandleOrUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);

    const res = await fetch("/api/creator-channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, handleOrUrl }),
    });
    setAdding(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not add channel");
      return;
    }

    setHandleOrUrl("");
    router.refresh();
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    setError(null);
    const res = await fetch(`/api/creator-channels/${id}`, { method: "DELETE" });
    setRemovingId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not remove channel");
      return;
    }

    router.refresh();
  }

  return (
    <section className="mt-8 border border-white/10 bg-surface p-4">
      <h2 className="font-display text-lg font-medium text-white">Your channels</h2>
      <p className="mt-1 text-sm text-white/50">
        Add every channel you publish on — the more we know, the better we can match you with campaigns.
      </p>

      {channels.length > 0 && (
        <ul className="mt-4 space-y-2">
          {channels.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 border border-white/10 bg-surface2 px-3 py-2">
              <span className="text-sm text-white/80">
                <span className="font-display text-xs uppercase tracking-wider text-white/50">
                  {PLATFORM_LABELS[c.platform]}
                </span>{" "}
                {c.handleOrUrl}
              </span>
              <button
                onClick={() => handleRemove(c.id)}
                disabled={removingId === c.id}
                className="font-display text-xs uppercase tracking-wider text-white/40 underline hover:text-white/70 disabled:opacity-50"
              >
                {removingId === c.id ? "Removing..." : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-end">
        <div>
          <label className="block font-display text-xs uppercase tracking-wider text-white/50">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Channel["platform"])}
            className="mt-1 border border-white/20 bg-surface px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
          >
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block font-display text-xs uppercase tracking-wider text-white/50">
            Handle or URL
          </label>
          <input
            type="text"
            required
            value={handleOrUrl}
            onChange={(e) => setHandleOrUrl(e.target.value)}
            placeholder="@yourhandle or https://..."
            className="mt-1 w-full border border-white/20 bg-surface px-3 py-2 text-sm text-white placeholder-white/30 focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="bg-accent px-3 py-2 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
        >
          {adding ? "Adding..." : "Add channel"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}
