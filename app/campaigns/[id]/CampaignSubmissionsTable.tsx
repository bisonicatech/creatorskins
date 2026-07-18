"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReelEmbed } from "@/app/ReelEmbed";
import { YouTubeViewCount } from "@/app/YouTubeViewCount";
import { PAYOUT_HOLD_HOURS } from "@/lib/payoutHold";

export type SubmissionRow = {
  key: string;
  id: string | null;
  displayName: string;
  agreedAmount: number;
  contentUrl: string | null;
  submissionStatus: "not_submitted" | "pending" | "verified" | "rejected";
  payoutStatus: "processing" | "pending" | "paid" | "failed" | null;
  rejectionReason: string | null;
  verifiedAt: string | null;
  flaggedAt: string | null;
  flagReason: string | null;
  flagResolvedAt: string | null;
};

function paymentStatusLabel(row: SubmissionRow) {
  if (row.payoutStatus === "paid") return "Paid";
  if (row.payoutStatus === "processing") return "Payout processing";
  if (row.payoutStatus === "failed") return "Payout failed";
  return "Payout pending";
}

function canFlag(row: SubmissionRow): boolean {
  if (row.submissionStatus !== "verified" || row.flaggedAt || !row.verifiedAt) return false;
  const deadline = new Date(row.verifiedAt).getTime() + PAYOUT_HOLD_HOURS * 60 * 60 * 1000;
  return Date.now() < deadline;
}

function SubmissionCard({ row, currency }: { row: SubmissionRow; currency: string }) {
  const router = useRouter();
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFlag() {
    if (!reason.trim()) {
      setError("Enter a reason before flagging");
      return;
    }
    if (!row.id) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/submissions/${row.id}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not flag this submission");
      return;
    }
    setFlagging(false);
    setReason("");
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-4 border border-white/10 bg-surface p-4 sm:flex-row">
      {row.contentUrl && (
        <div className="shrink-0">
          <ReelEmbed url={row.contentUrl} />
        </div>
      )}
      <div className="flex-1">
        <p className="font-medium text-white">{row.displayName}</p>
        <p className="mt-1 text-sm text-white/55">
          {(row.agreedAmount / 100).toFixed(2)} {currency.toUpperCase()}
        </p>
        {row.submissionStatus === "verified" && (
          <p className="mt-1 text-sm text-white/70">{paymentStatusLabel(row)}</p>
        )}
        {row.submissionStatus === "pending" && (
          <p className="mt-1 text-sm text-white/70">Submitted — awaiting approval</p>
        )}
        {row.submissionStatus === "not_submitted" && (
          <p className="mt-1 text-sm text-white/70">Awaiting content</p>
        )}
        {row.submissionStatus === "rejected" && row.rejectionReason && (
          <p className="mt-1 text-sm text-red-400">Reason: {row.rejectionReason}</p>
        )}
        {row.flaggedAt && !row.flagResolvedAt && (
          <p className="mt-1 text-sm text-amber-400">Flagged, awaiting our review: {row.flagReason}</p>
        )}
        {row.flaggedAt && row.flagResolvedAt && (
          <p className="mt-1 text-xs text-white/40">Previously flagged — resolved</p>
        )}
        {row.contentUrl && (
          <a
            href={row.contentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block break-all text-sm text-accent underline"
          >
            {row.contentUrl}
          </a>
        )}
        {row.contentUrl && <YouTubeViewCount url={row.contentUrl} />}

        {canFlag(row) && !flagging && (
          <button
            onClick={() => setFlagging(true)}
            className="mt-2 border border-white/20 px-3 py-1 font-display text-xs uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white"
          >
            Flag for review
          </button>
        )}

        {flagging && (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block font-display text-xs uppercase tracking-wider text-white/50">
                What's off with this content?
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. wrong product shown"
                className="mt-1 w-full border border-white/20 bg-surface2 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-accent focus:outline-none"
              />
            </div>
            <button
              onClick={handleFlag}
              disabled={submitting}
              className="border border-white/20 px-3 py-2 font-display text-xs uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-50"
            >
              {submitting ? "Flagging..." : "Confirm flag"}
            </button>
            <button
              onClick={() => {
                setFlagging(false);
                setReason("");
                setError(null);
              }}
              className="text-sm text-white/40 underline"
            >
              Cancel
            </button>
          </div>
        )}
        {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
      </div>
    </li>
  );
}

export function CampaignSubmissionsTable({ rows, currency }: { rows: SubmissionRow[]; currency: string }) {
  const approved = rows.filter((r) => r.submissionStatus === "verified");
  const awaitingApproval = rows.filter((r) => r.submissionStatus === "pending" || r.submissionStatus === "not_submitted");
  const rejected = rows.filter((r) => r.submissionStatus === "rejected");

  return (
    <section className="mt-10 border-t border-white/10 pt-6">
      <h2 className="font-display text-lg font-medium text-white">Creators &amp; content</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-white/50">No creators assigned yet.</p>
      ) : (
        <div className="mt-4 space-y-8">
          <div>
            <h3 className="font-display text-xs font-medium uppercase tracking-wider text-white/50">
              Approved &amp; paid
            </h3>
            {approved.length === 0 ? (
              <p className="mt-2 text-sm text-white/40">Nothing approved yet.</p>
            ) : (
              <ul className="mt-2 space-y-4">
                {approved.map((row) => (
                  <SubmissionCard key={row.key} row={row} currency={currency} />
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="font-display text-xs font-medium uppercase tracking-wider text-white/50">
              Awaiting approval
            </h3>
            {awaitingApproval.length === 0 ? (
              <p className="mt-2 text-sm text-white/40">Nothing waiting on review.</p>
            ) : (
              <ul className="mt-2 space-y-4">
                {awaitingApproval.map((row) => (
                  <SubmissionCard key={row.key} row={row} currency={currency} />
                ))}
              </ul>
            )}
          </div>

          {rejected.length > 0 && (
            <div>
              <h3 className="font-display text-xs font-medium uppercase tracking-wider text-white/50">Rejected</h3>
              <ul className="mt-2 space-y-4">
                {rejected.map((row) => (
                  <SubmissionCard key={row.key} row={row} currency={currency} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
