import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// Dev-only: lets you get an authenticated session cookie via curl for testing
// the other routes before a real sign-in page exists. Never runs in production.
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const { email, password } = (await request.json()) as { email: string; password: string };

  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ userId: data.user?.id });
}
