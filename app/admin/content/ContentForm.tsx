"use client";

import { useState } from "react";

export type ContentField = { key: string; value: string; label: string };
type Section = { title: string; fields: ContentField[] };

export function ContentForm({ sections }: { sections: Section[] }) {
  const initial = Object.fromEntries(sections.flatMap((s) => s.fields).map((f) => [f.key, f.value]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/admin/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save changes");
      return;
    }

    setSaved(true);
  }

  return (
    <form onSubmit={handleSave} className="mt-8 space-y-10">
      {sections.map((section) => (
        <section key={section.title}>
          <h2 className="font-display text-lg font-medium text-white">{section.title}</h2>
          <div className="mt-4 space-y-4">
            {section.fields.map((field) => (
              <div key={field.key}>
                <label className="block font-display text-xs uppercase tracking-wider text-white/50">
                  {field.label}
                </label>
                <input
                  type="text"
                  value={values[field.key]}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="mt-1 w-full border border-white/20 bg-surface px-3 py-2 text-sm text-white placeholder-white/30 focus:border-accent focus:outline-none"
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-4 border-t border-white/10 pt-6">
        <button
          type="submit"
          disabled={saving}
          className="bg-accent px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-ink transition hover:bg-accent-light disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {saved && <span className="text-sm text-positive">Saved.</span>}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </form>
  );
}
