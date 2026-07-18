"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Campaign = {
  id: string;
  title: string;
  budget_amount: number;
  escrow_balance: number;
  currency: string;
  status: string;
  assignedCreators: { displayName: string; agreedAmount: number }[];
};

export function BrandCampaigns({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState("");
  const [rate, setRate] = useState("");
  const [maxSubmissions, setMaxSubmissions] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [fundingId, setFundingId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);

    const budgetAmount = Math.round(Number(budget) * 100);
    const ratePerCreator = rate ? Math.round(Number(rate) * 100) : undefined;
    const maxSubmissionsPerCreator = maxSubmissions ? Math.round(Number(maxSubmissions)) : undefined;
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, budgetAmount, ratePerCreator, maxSubmissionsPerCreator }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not create campaign");
      setCreating(false);
      return;
    }

    setTitle("");
    setBudget("");
    setRate("");
    setMaxSubmissions("1");
    setCreating(false);
    router.refresh();
  }

  async function handleFund(campaignId: string, method: "deposit" | "invoice") {
    setFundingId(campaignId);
    const res = await fetch(`/api/campaigns/${campaignId}/${method}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setFundingId(null);

    if (!res.ok) {
      setError(body.error ?? "Could not start funding");
      return;
    }

    window.location.href = body.url ?? body.invoiceUrl;
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-medium text-white">Your campaigns</h2>

      <ul className="mt-4 space-y-3">
        {campaigns.length === 0 && <p className="text-sm text-white/50">No campaigns yet.</p>}
        {campaigns.map((c) => (
          <li key={c.id} className="border border-white/10 bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-white">{c.title}</p>
                <p className="text-sm text-white/55">
                  {c.status} — {(c.budget_amount / 100).toFixed(2)} {c.currency.toUpperCase()} budget,{" "}
                  {(c.escrow_balance / 100).toFixed(2)} {c.currency.toUpperCase()} in escrow
                </p>
                {c.assignedCreators.length > 0 && (
                  <p className="mt-1 text-sm text-white/40">
                    Assigned:{" "}
                    {c.assignedCreators
                      .map((a) => `${a.displayName} (${(a.agreedAmount / 100).toFixed(2)})`)
                      .join(", ")}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {c.status === "draft" && (
                  <>
                    <button
                      onClick={() => handleFund(c.id, "deposit")}
                      disabled={fundingId === c.id}
                      className="border border-white/20 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-50"
                    >
                      Fund by card
                    </button>
                    <button
                      onClick={() => handleFund(c.id, "invoice")}
                      disabled={fundingId === c.id}
                      className="border border-white/20 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-50"
                    >
                      Send invoice (NET-30)
                    </button>
                  </>
                )}
                <Link
                  href={`/campaigns/${c.id}`}
                  className="bg-accent px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light"
                >
                  View details
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <form
        onSubmit={handleCreate}
        className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="block font-display text-xs uppercase tracking-wider text-white/50">
            Campaign title
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full border border-white/20 bg-surface px-3 py-2 text-white placeholder-white/30 focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block font-display text-xs uppercase tracking-wider text-white/50">
            Budget (GBP)
          </label>
          <input
            type="number"
            required
            min="1"
            step="0.01"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="mt-1 w-full border border-white/20 bg-surface px-3 py-2 text-white placeholder-white/30 focus:border-accent focus:outline-none sm:w-32"
          />
        </div>
        <div>
          <label className="block font-display text-xs uppercase tracking-wider text-white/50">
            Rate per creator (GBP)
          </label>
          <input
            type="number"
            min="1"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="optional"
            className="mt-1 w-full border border-white/20 bg-surface px-3 py-2 text-white placeholder-white/30 focus:border-accent focus:outline-none sm:w-32"
          />
        </div>
        <div>
          <label className="block font-display text-xs uppercase tracking-wider text-white/50">
            Max paid videos per creator
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={maxSubmissions}
            onChange={(e) => setMaxSubmissions(e.target.value)}
            className="mt-1 w-full border border-white/20 bg-surface px-3 py-2 text-white placeholder-white/30 focus:border-accent focus:outline-none sm:w-32"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="bg-accent px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create campaign"}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}
