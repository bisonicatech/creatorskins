"use client";

import { useState } from "react";

export function CreatorConnect({
  onboardingComplete,
  payoutsEnabled,
}: {
  onboardingComplete: boolean;
  payoutsEnabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setError(null);
    setLoading(true);

    const res = await fetch("/api/connect/onboard", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Could not start onboarding");
      return;
    }

    window.location.href = body.url;
  }

  return (
    <section className="mt-10 border border-white/10 bg-surface p-4">
      <h2 className="font-display text-lg font-medium text-white">Payouts</h2>

      {payoutsEnabled ? (
        <p className="mt-2 text-sm text-positive">Your Stripe account is connected and ready for payouts.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-white/55">
            {onboardingComplete
              ? "Your Stripe account is set up, but payouts aren't enabled yet — check your Stripe onboarding status."
              : "Connect a Stripe account to receive payouts for your campaigns."}
          </p>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="mt-3 bg-accent px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
          >
            {loading ? "Redirecting..." : "Connect Stripe account"}
          </button>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </>
      )}
    </section>
  );
}
