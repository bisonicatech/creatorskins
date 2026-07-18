import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContentForm, type ContentField } from "./ContentForm";

const SECTIONS: { title: string; keys: string[] }[] = [
  {
    title: "Hero",
    keys: ["hero_eyebrow", "hero_strapline", "hero_subheading", "hero_cta_primary", "hero_cta_secondary"],
  },
  {
    title: "Reels",
    keys: ["reel_1_url", "reel_2_url", "reel_3_url"],
  },
  {
    title: "For Brands",
    keys: [
      "brand_heading",
      "brand_benefit_1",
      "brand_benefit_2",
      "brand_benefit_3",
      "brand_benefit_4",
      "brand_step_1",
      "brand_step_2",
      "brand_step_3",
      "brand_step_4",
      "brand_cta",
    ],
  },
  {
    title: "For Creators",
    keys: [
      "creator_heading",
      "creator_benefit_1",
      "creator_benefit_2",
      "creator_benefit_3",
      "creator_benefit_4",
      "creator_step_1",
      "creator_step_2",
      "creator_step_3",
      "creator_step_4",
      "creator_cta",
    ],
  },
];

export default async function AdminContentPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();
  const { data: staff } = await admin.from("staff").select("user_id").eq("user_id", user.id).maybeSingle();

  if (!staff) {
    redirect("/dashboard");
  }

  const { data: rows } = await admin.from("site_content").select("key, value, label");
  const byKey = new Map((rows ?? []).map((r) => [r.key, r]));

  const sections = SECTIONS.map((section) => ({
    title: section.title,
    fields: section.keys
      .map((key): ContentField | null => {
        const row = byKey.get(key);
        if (!row) return null;
        return { key, value: row.value, label: row.label };
      })
      .filter((f): f is ContentField => f !== null),
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="font-display text-2xl font-medium text-white">Landing page content</h1>
      <p className="mt-2 text-sm text-white/55">
        Edit the copy shown on the public landing page. Changes go live immediately after saving.
      </p>

      <ContentForm sections={sections} />
    </main>
  );
}
