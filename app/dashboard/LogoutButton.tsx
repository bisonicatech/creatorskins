"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="border border-white/20 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-white/70 transition hover:border-white/40 hover:text-white"
    >
      Log out
    </button>
  );
}
