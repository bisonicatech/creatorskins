"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ReelEmbed } from "@/app/ReelEmbed";

type Asset = {
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  url: string | null;
  downloadUrl: string | null;
};

export type MySubmission = {
  id: string;
  contentUrl: string | null;
  status: "pending" | "verified" | "rejected";
  payoutStatus: "processing" | "pending" | "paid" | "failed" | null;
  rejectionReason: string | null;
};

function statusLabel(s: MySubmission) {
  if (s.status === "rejected") return "Rejected";
  if (s.status === "pending") return "This video is now awaiting verification before payout — please bear with us";
  if (s.payoutStatus === "paid") return "Paid";
  if (s.payoutStatus === "processing") return "Payout processing";
  if (s.payoutStatus === "failed") return "Payout failed";
  return "Verified — payout pending";
}

export function CampaignDetailCreator({
  campaignId,
  agreedAmount,
  currency,
  submissions,
}: {
  campaignId: string;
  agreedAmount: number;
  currency: string;
  submissions: MySubmission[];
}) {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [contentUrl, setContentUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/assets`)
      .then((res) => res.json())
      .then((body) => setAssets(body.assets ?? []))
      .catch(() => setAssets([]));
  }, [campaignId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, contentUrl }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not submit content");
      return;
    }

    setContentUrl("");
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-6">
      <section>
        <h2 className="font-display text-lg font-medium text-white">Your rate</h2>
        <p className="mt-2 text-white/70">
          {(agreedAmount / 100).toFixed(2)} {currency.toUpperCase()}
        </p>
      </section>

      <section className="border-t border-white/10 pt-6">
        <h2 className="font-display text-lg font-medium text-white">Assets</h2>
        {assets === null && <p className="mt-2 text-sm text-white/50">Loading...</p>}
        {assets && assets.length === 0 && <p className="mt-2 text-sm text-white/50">No assets uploaded yet.</p>}
        {assets && assets.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-4">
            {assets.map((a) => (
              <li key={a.id}>
                {a.url && a.contentType?.startsWith("video/") ? (
                  <video
                    controls
                    src={a.url}
                    className="max-w-[220px] border border-white/10 bg-surface"
                  />
                ) : a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-sm text-accent underline">
                    {a.fileName}
                  </a>
                ) : (
                  <span className="text-sm text-white/70">{a.fileName}</span>
                )}
                <div className="mt-1 flex items-center gap-3">
                  <p className="text-xs text-white/40">{a.fileName}</p>
                  {a.downloadUrl && (
                    <a
                      href={a.downloadUrl}
                      className="font-display text-xs uppercase tracking-wider text-accent underline"
                    >
                      Download
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-white/10 pt-6">
        <h2 className="font-display text-lg font-medium text-white">Submit content</h2>
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block font-display text-xs uppercase tracking-wider text-white/50">
              Content URL
            </label>
            <input
              type="url"
              required
              value={contentUrl}
              onChange={(e) => setContentUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full border border-white/20 bg-surface px-3 py-2 text-sm text-white placeholder-white/30 focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="bg-accent px-3 py-2 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit for review"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        {submissions.length > 0 && (
          <div className="mt-6 space-y-6">
            {submissions.map((s) => (
              <div key={s.id}>
                {s.contentUrl && <ReelEmbed url={s.contentUrl} />}
                {s.contentUrl && (
                  <a
                    href={s.contentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block text-sm text-accent underline"
                  >
                    {s.contentUrl}
                  </a>
                )}
                <p className="mt-2 text-sm text-white/70">{statusLabel(s)}</p>
                {s.status === "rejected" && s.rejectionReason && (
                  <p className="mt-1 text-sm text-red-400">Reason: {s.rejectionReason}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
