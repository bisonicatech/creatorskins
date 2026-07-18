"use client";

import { useEffect, useState } from "react";

type OpenCampaign = {
  id: string;
  title: string;
  budgetAmount: number;
  ratePerCreator: number;
  currency: string;
  requestStatus: "pending" | "approved" | "denied" | "assigned" | null;
};

export function BrowseCampaigns() {
  const [campaigns, setCampaigns] = useState<OpenCampaign[] | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/campaigns/open")
      .then((res) => res.json())
      .then((body) => setCampaigns(body.campaigns ?? []))
      .catch(() => setCampaigns([]));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRequest(id: string) {
    setRequestingId(id);
    setError(null);
    const res = await fetch(`/api/campaigns/${id}/request`, { method: "POST" });
    setRequestingId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not request access");
      return;
    }

    load();
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-medium text-white">Browse campaigns</h2>

      <ul className="mt-4 space-y-3">
        {campaigns === null && <p className="text-sm text-white/50">Loading...</p>}
        {campaigns && campaigns.length === 0 && (
          <p className="text-sm text-white/50">No open campaigns right now.</p>
        )}
        {campaigns?.map((c) => (
          <li key={c.id} className="border border-white/10 bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-white">{c.title}</p>
                <p className="text-sm text-white/55">
                  Rate: {(c.ratePerCreator / 100).toFixed(2)} {c.currency.toUpperCase()} — Budget:{" "}
                  {(c.budgetAmount / 100).toFixed(2)} {c.currency.toUpperCase()}
                </p>
              </div>
              {c.requestStatus === null && (
                <button
                  onClick={() => handleRequest(c.id)}
                  disabled={requestingId === c.id}
                  className="bg-accent px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
                >
                  Request access
                </button>
              )}
              {c.requestStatus && (
                <span className="text-sm text-white/50">
                  {c.requestStatus === "pending" && "Request pending"}
                  {c.requestStatus === "approved" && "Approved"}
                  {c.requestStatus === "denied" && "Request denied"}
                  {c.requestStatus === "assigned" && "Assigned"}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}
