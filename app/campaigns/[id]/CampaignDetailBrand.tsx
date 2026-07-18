"use client";

import { useEffect, useState } from "react";

type Asset = {
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  url: string | null;
};

type CreatorSearchResult = {
  id: string;
  display_name: string;
  stripe_payouts_enabled: boolean;
};

export function CampaignDetailBrand({
  campaignId,
  status,
  currency,
}: {
  campaignId: string;
  status: string;
  currency: string;
}) {
  const [fundingMethod, setFundingMethod] = useState<"deposit" | "invoice" | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [assignEmail, setAssignEmail] = useState("");
  const [assignRate, setAssignRate] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CreatorSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadAssets() {
    fetch(`/api/campaigns/${campaignId}/assets`)
      .then((res) => res.json())
      .then((body) => setAssets(body.assets ?? []))
      .catch(() => setAssets([]));
  }

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      const res = await fetch(`/api/creators/search?q=${encodeURIComponent(searchQuery)}`);
      const body = await res.json().catch(() => ({}));
      setSearching(false);
      setSearchResults(res.ok ? body.creators ?? [] : []);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  async function handleFund(method: "deposit" | "invoice", isTopUp: boolean) {
    let body: Record<string, number> | undefined;
    if (isTopUp) {
      const amount = Math.round(Number(topUpAmount) * 100);
      if (!amount || amount <= 0) {
        setError("Enter a top-up amount");
        return;
      }
      body = { topUpAmount: amount };
    }

    setFundingMethod(method);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/${method}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const responseBody = await res.json().catch(() => ({}));
    setFundingMethod(null);

    if (!res.ok) {
      setError(responseBody.error ?? "Could not start funding");
      return;
    }

    window.location.href = responseBody.url ?? responseBody.invoiceUrl;
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/campaigns/${campaignId}/assets`, { method: "POST", body: formData });
    setUploading(false);
    e.target.value = "";

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed");
      return;
    }

    loadAssets();
  }

  async function handleAssignByEmail(e: React.FormEvent) {
    e.preventDefault();
    setAssigning(true);
    setError(null);

    const agreedAmount = Math.round(Number(assignRate) * 100);
    const res = await fetch(`/api/campaigns/${campaignId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: assignEmail, agreedAmount }),
    });
    setAssigning(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not assign creator");
      return;
    }

    setAssignEmail("");
    window.location.reload();
  }

  async function handleAssignById(creatorId: string) {
    const agreedAmount = Math.round(Number(assignRate) * 100);
    if (!agreedAmount || agreedAmount <= 0) {
      setError("Enter a rate before assigning");
      return;
    }

    setAssigningId(creatorId);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorId, agreedAmount }),
    });
    setAssigningId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not assign creator");
      return;
    }

    window.location.reload();
  }

  return (
    <div className="mt-8 space-y-6">
      {status === "draft" && (
        <section>
          <h2 className="font-display text-lg font-medium text-white">Fund this campaign</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => handleFund("deposit", false)}
              disabled={fundingMethod === "deposit"}
              className="bg-accent px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
            >
              Fund by card
            </button>
            <button
              onClick={() => handleFund("invoice", false)}
              disabled={fundingMethod === "invoice"}
              className="border border-white/20 px-4 py-2 font-display text-xs uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-50"
            >
              Send invoice (NET-30)
            </button>
          </div>
        </section>
      )}

      {(status === "funded" || status === "active") && (
        <section>
          <h2 className="font-display text-lg font-medium text-white">Top up escrow</h2>
          <p className="mt-1 text-sm text-white/50">Add more funds to this campaign's escrow balance.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div>
              <label className="block font-display text-xs uppercase tracking-wider text-white/50">
                Amount ({currency.toUpperCase()})
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                placeholder="e.g. 20.00"
                className="mt-1 w-32 border border-white/20 bg-surface px-3 py-2 text-sm text-white placeholder-white/30 focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleFund("deposit", true)}
                disabled={fundingMethod === "deposit"}
                className="bg-accent px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
              >
                Top up by card
              </button>
              <button
                onClick={() => handleFund("invoice", true)}
                disabled={fundingMethod === "invoice"}
                className="border border-white/20 px-4 py-2 font-display text-xs uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-50"
              >
                Top up by invoice (NET-30)
              </button>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-lg font-medium text-white">Assets</h2>
        {assets === null && <p className="mt-2 text-sm text-white/50">Loading...</p>}
        {assets && assets.length === 0 && <p className="mt-2 text-sm text-white/50">No assets uploaded yet.</p>}
        {assets && assets.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-4">
            {assets.map((a) => (
              <li key={a.id}>
                {a.url && a.contentType?.startsWith("video/") ? (
                  <video controls src={a.url} className="max-w-[220px] border border-white/10 bg-surface" />
                ) : a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-sm text-accent underline">
                    {a.fileName}
                  </a>
                ) : (
                  <span className="text-sm text-white/70">{a.fileName}</span>
                )}
                <p className="mt-1 text-xs text-white/40">{a.fileName}</p>
              </li>
            ))}
          </ul>
        )}
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm,image/png"
          onChange={handleUpload}
          disabled={uploading}
          className="mt-2 text-sm text-white/55 file:mr-3 file:border file:border-white/20 file:bg-surface file:px-3 file:py-1.5 file:text-white/70"
        />
      </section>

      <section className="border-t border-white/10 pt-6">
        <h2 className="font-display text-lg font-medium text-white">Assign a creator</h2>

        <div className="mt-3">
          <label className="block font-display text-xs uppercase tracking-wider text-white/50">
            Rate ({currency.toUpperCase()})
          </label>
          <input
            type="number"
            min="1"
            step="0.01"
            value={assignRate}
            onChange={(e) => setAssignRate(e.target.value)}
            placeholder="e.g. 20.00"
            className="mt-1 w-28 border border-white/20 bg-surface px-3 py-2 text-sm text-white placeholder-white/30 focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-xs text-white/40">Set the rate first, then search or enter an email below.</p>
        </div>

        <div className="mt-4">
          <label className="block font-display text-xs uppercase tracking-wider text-white/50">
            Search creators by name
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Start typing a name..."
            className="mt-1 w-full border border-white/20 bg-surface px-3 py-2 text-sm text-white placeholder-white/30 focus:border-accent focus:outline-none"
          />
          {searching && <p className="mt-1 text-sm text-white/50">Searching...</p>}
          {searchResults && searchResults.length === 0 && !searching && (
            <p className="mt-1 text-sm text-white/50">No creators found.</p>
          )}
          {searchResults && searchResults.length > 0 && (
            <ul className="mt-2 space-y-1">
              {searchResults.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between border border-white/10 bg-surface px-3 py-2 text-sm"
                >
                  <span className="text-white/80">
                    {c.display_name}
                    {!c.stripe_payouts_enabled && (
                      <span className="ml-2 text-xs text-white/40">(payouts not yet set up)</span>
                    )}
                  </span>
                  <button
                    onClick={() => handleAssignById(c.id)}
                    disabled={assigningId === c.id}
                    className="bg-accent px-3 py-1 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
                  >
                    {assigningId === c.id ? "Assigning..." : "Assign"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={handleAssignByEmail}
          className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label className="block font-display text-xs uppercase tracking-wider text-white/50">
              Or assign by exact email
            </label>
            <input
              type="email"
              required
              value={assignEmail}
              onChange={(e) => setAssignEmail(e.target.value)}
              className="mt-1 w-full border border-white/20 bg-surface px-3 py-2 text-sm text-white placeholder-white/30 focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={assigning}
            className="border border-white/20 px-3 py-2 font-display text-xs uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-50"
          >
            {assigning ? "Assigning..." : "Assign"}
          </button>
        </form>
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
