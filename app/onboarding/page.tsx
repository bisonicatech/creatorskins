"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const [role, setRole] = useState<"brand" | "creator">("brand");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/complete-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, name }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not finish setting up your account");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="font-display text-2xl font-medium text-white">Finish setting up your account</h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="radio"
              name="role"
              checked={role === "brand"}
              onChange={() => setRole("brand")}
              className="accent-accent"
            />
            Brand
          </label>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="radio"
              name="role"
              checked={role === "creator"}
              onChange={() => setRole("creator")}
              className="accent-accent"
            />
            Creator
          </label>
        </div>

        <div>
          <label className="block font-display text-xs uppercase tracking-wider text-white/50">
            {role === "brand" ? "Company name" : "Display name"}
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border border-white/20 bg-surface px-3 py-2 text-white placeholder-white/30 focus:border-accent focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.1em] text-ink transition hover:bg-accent-light disabled:opacity-50"
        >
          {loading ? "Saving..." : "Continue"}
        </button>
      </form>
    </main>
  );
}
