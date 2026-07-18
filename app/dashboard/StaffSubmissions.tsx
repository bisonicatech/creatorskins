"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { holdWindowPassed, holdWindowDeadline } from "@/lib/payoutHold";
import { YouTubeViewCount } from "@/app/YouTubeViewCount";

type Submission = {
  id: string;
  content_url: string | null;
  agreed_amount: number;
  status: string;
  campaign_title: string;
  currency: string;
  creator_name: string;
  payout_status: string | null;
  rejection_reason: string | null;
  verified_at: string | null;
  flagged_at: string | null;
  flag_reason: string | null;
  flag_resolved_at: string | null;
};

export function StaffSubmissions({ submissions }: { submissions: Submission[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function handleVerify(id: string) {
    setError(null);
    setErrorId(null);
    setBusyId(id);
    const res = await fetch(`/api/submissions/${id}/verify`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not verify submission");
      setErrorId(id);
      return;
    }
    router.refresh();
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) {
      setError("Enter a reason before rejecting");
      setErrorId(id);
      return;
    }
    setError(null);
    setErrorId(null);
    setBusyId(id);
    const res = await fetch(`/api/submissions/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not reject submission");
      setErrorId(id);
      return;
    }
    setRejectingId(null);
    setRejectReason("");
    router.refresh();
  }

  async function handleDismissFlag(id: string) {
    setError(null);
    setErrorId(null);
    setBusyId(id);
    const res = await fetch(`/api/submissions/${id}/resolve-flag`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not resolve flag");
      setErrorId(id);
      return;
    }
    router.refresh();
  }

  async function handleRelease(id: string) {
    setError(null);
    setErrorId(null);
    setBusyId(id);
    const res = await fetch("/api/payouts/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: id }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not release payout");
      setErrorId(id);
      return;
    }
    router.refresh();
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-medium text-white">Submissions (staff)</h2>

      <ul className="mt-4 space-y-3">
        {submissions.length === 0 && <p className="text-sm text-white/50">No submissions yet.</p>}
        {submissions.map((s) => {
          const hasOpenFlag = Boolean(s.flagged_at) && !s.flag_resolved_at;
          const windowPassed = holdWindowPassed(s.verified_at);
          const canRelease =
            s.status === "verified" && !s.payout_status && !hasOpenFlag && (windowPassed || Boolean(s.flagged_at));
          const waitingOnWindow =
            s.status === "verified" && !s.payout_status && !hasOpenFlag && !windowPassed && !s.flagged_at;

          return (
            <li key={s.id} className="border border-white/10 bg-surface p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-white">
                    {s.campaign_title} — {s.creator_name}
                  </p>
                  <p className="text-sm text-white/55">
                    {s.status}
                    {s.payout_status ? ` — payout ${s.payout_status}` : ""} —{" "}
                    {(s.agreed_amount / 100).toFixed(2)} {s.currency.toUpperCase()}
                    {s.content_url && (
                      <>
                        {" — "}
                        <a href={s.content_url} target="_blank" rel="noreferrer" className="text-accent underline">
                          content
                        </a>
                      </>
                    )}
                  </p>
                  {s.status === "rejected" && s.rejection_reason && (
                    <p className="mt-1 text-sm text-red-400">Rejected: {s.rejection_reason}</p>
                  )}
                  {hasOpenFlag && (
                    <p className="mt-1 text-sm text-amber-400">Flagged by brand: {s.flag_reason}</p>
                  )}
                  {waitingOnWindow && s.verified_at && (
                    <p className="mt-1 text-xs text-white/40">
                      Payout available after {new Date(holdWindowDeadline(s.verified_at)).toLocaleString()}
                    </p>
                  )}
                  {s.content_url && <YouTubeViewCount url={s.content_url} />}
                </div>
                <div className="flex gap-2">
                  {s.status === "pending" && rejectingId !== s.id && (
                    <>
                      <button
                        onClick={() => handleVerify(s.id)}
                        disabled={busyId === s.id}
                        className="bg-accent px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
                      >
                        Verify
                      </button>
                      <button
                        onClick={() => setRejectingId(s.id)}
                        disabled={busyId === s.id}
                        className="border border-white/20 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {hasOpenFlag && rejectingId !== s.id && (
                    <>
                      <button
                        onClick={() => handleDismissFlag(s.id)}
                        disabled={busyId === s.id}
                        className="bg-accent px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
                      >
                        Dismiss flag
                      </button>
                      <button
                        onClick={() => setRejectingId(s.id)}
                        disabled={busyId === s.id}
                        className="border border-white/20 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {canRelease && (
                    <button
                      onClick={() => handleRelease(s.id)}
                      disabled={busyId === s.id}
                      className="bg-accent px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
                    >
                      Release payout
                    </button>
                  )}
                </div>
              </div>

              {rejectingId === s.id && (
                <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="block font-display text-xs uppercase tracking-wider text-white/50">
                      Reason (shown to the creator)
                    </label>
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. overlay not clearly visible in the video"
                      className="mt-1 w-full border border-white/20 bg-surface2 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-accent focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => handleReject(s.id)}
                    disabled={busyId === s.id}
                    className="bg-accent px-3 py-2 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
                  >
                    {busyId === s.id ? "Rejecting..." : "Confirm reject"}
                  </button>
                  <button
                    onClick={() => {
                      setRejectingId(null);
                      setRejectReason("");
                    }}
                    className="border border-white/20 px-3 py-2 font-display text-xs uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {errorId === s.id && error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
