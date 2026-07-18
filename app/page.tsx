import { createServerSupabase } from "@/lib/supabase/server";
import { ReelEmbed } from "./ReelEmbed";

const DEFAULTS: Record<string, string> = {
  hero_eyebrow: "Brand-funded video overlay platform",
  hero_strapline: "Real Brands, Reel Payments",
  hero_subheading: "Brands fund campaigns, creators publish, verified work gets paid out automatically.",
  hero_cta_primary: "Get started",
  hero_cta_secondary: "Log in",

  reel_1_url: "",
  reel_2_url: "",
  reel_3_url: "",

  brand_heading: "For Brands",
  brand_benefit_1: "Funds held safely in escrow until work is verified",
  brand_benefit_2: "Pay by card, or by invoice with NET-30 terms",
  brand_benefit_3: "Choose your own creators and agree rates upfront",
  brand_benefit_4: "Track every creator's content and payment status in one place",
  brand_step_1: "Fund a campaign",
  brand_step_2: "Assign a creator at an agreed rate",
  brand_step_3: "Review submitted content",
  brand_step_4: "Our team verifies it, then payout releases automatically",
  brand_cta: "Get started as a brand",

  creator_heading: "For Creators",
  creator_benefit_1: "Budget is already secured before you start work",
  creator_benefit_2: "Get paid once your work is verified — no chasing invoices",
  creator_benefit_3: "Payouts go straight to your bank via Stripe",
  creator_benefit_4: "Keep 82.5% of the agreed rate",
  creator_step_1: "Get assigned to a campaign",
  creator_step_2: "Download the overlay assets",
  creator_step_3: "Publish your content and submit for review",
  creator_step_4: "Get paid automatically once verified",
  creator_cta: "Get started as a creator",
};

async function getContent(): Promise<Record<string, string>> {
  const supabase = createServerSupabase();
  const { data } = await supabase.from("site_content").select("key, value");
  const fromDb = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return { ...DEFAULTS, ...fromDb };
}

export default async function Home() {
  const c = await getContent();

  const audiences = [
    {
      role: "brand" as const,
      heading: c.brand_heading,
      benefits: [c.brand_benefit_1, c.brand_benefit_2, c.brand_benefit_3, c.brand_benefit_4],
      reelUrl: c.reel_2_url,
      steps: [c.brand_step_1, c.brand_step_2, c.brand_step_3, c.brand_step_4],
      cta: c.brand_cta,
    },
    {
      role: "creator" as const,
      heading: c.creator_heading,
      benefits: [c.creator_benefit_1, c.creator_benefit_2, c.creator_benefit_3, c.creator_benefit_4],
      reelUrl: c.reel_3_url,
      steps: [c.creator_step_1, c.creator_step_2, c.creator_step_3, c.creator_step_4],
      cta: c.creator_cta,
    },
  ];

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-3xl px-6 py-28">
        <div className="flex items-center gap-3 font-display text-xs font-medium uppercase tracking-[0.25em] text-accent">
          <span className="h-px w-6 bg-accent" />
          {c.hero_eyebrow}
        </div>

        <h1 className="mt-6 font-display text-5xl font-light tracking-tight text-white sm:text-6xl">
          CreatorSkins
        </h1>
        <p className="mt-2 font-display text-3xl font-bold tracking-tight text-accent sm:text-4xl">
          {c.hero_strapline}
        </p>

        <p className="mt-6 max-w-xl text-lg font-light text-white/55">{c.hero_subheading}</p>

        <div className="mt-10 flex flex-wrap gap-4">
          <a
            href="/signup"
            className="bg-accent px-8 py-4 font-display text-xs font-semibold uppercase tracking-[0.1em] text-ink transition hover:bg-accent-light"
          >
            {c.hero_cta_primary}
          </a>
          <a
            href="/login"
            className="border border-white/20 px-8 py-4 font-display text-xs uppercase tracking-[0.1em] text-white/70 transition hover:border-white/40 hover:text-white"
          >
            {c.hero_cta_secondary}
          </a>
        </div>

        {c.reel_1_url && (
          <div className="mt-10">
            <ReelEmbed url={c.reel_1_url} />
          </div>
        )}
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-px bg-white/10 sm:grid-cols-2">
          {audiences.map((a) => (
            <div key={a.role} className="bg-ink p-10 sm:p-12">
              <h2 className="font-display text-2xl font-medium text-white">{a.heading}</h2>

              <ul className="mt-6 space-y-3">
                {a.benefits.map((b) => (
                  <li key={b} className="flex gap-3 text-sm text-white/55">
                    <span className="text-accent">&mdash;</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              {a.reelUrl && (
                <div className="mt-6">
                  <ReelEmbed url={a.reelUrl} />
                </div>
              )}

              <ol className="mt-8 space-y-4 border-t border-white/10 pt-8">
                {a.steps.map((step, i) => (
                  <li key={step} className="flex gap-4">
                    <span className="font-display text-lg font-bold text-white/25">0{i + 1}</span>
                    <span className="text-sm text-white/70">{step}</span>
                  </li>
                ))}
              </ol>

              <a
                href={`/signup?role=${a.role}`}
                className="mt-10 inline-block border border-white/20 px-6 py-3 font-display text-xs uppercase tracking-[0.1em] text-white/70 transition hover:border-accent hover:text-accent"
              >
                {a.cta}
              </a>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
