"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Request = {
  id: string;
  campaignTitle: string;
  ratePerCreator: number | null;
  currency: string;
  creatorName: string;
};

export function StaffCampaignRequests({ requests }: { requests: Request[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDecision(id: string, decision: "approve" | "deny") {
    setError(null);
    setBusyId(id);
    const res = await fetch(`/api/campaign-requests/${id}/${decision}`, { method: "POST" });
    setBusyId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not update request");
      return;
    }

    router.refresh();
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-medium text-white">Campaign requests (staff)</h2>

      <ul className="mt-4 space-y-3">
        {requests.length === 0 && <p className="text-sm text-white/50">No pending requests.</p>}
        {requests.map((r) => (
          <li key={r.id} className="border border-white/10 bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-white">
                  {r.campaignTitle} — {r.creatorName}
                </p>
                <p className="text-sm text-white/55">
                  Rate: {r.ratePerCreator ? (r.ratePerCreator / 100).toFixed(2) : "?"} {r.currency.toUpperCase()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleDecision(r.id, "approve")}
                  disabled={busyId === r.id}
                  className="bg-accent px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleDecision(r.id, "deny")}
                  disabled={busyId === r.id}
                  className="border border-white/20 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-50"
                >
                  Deny
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}
