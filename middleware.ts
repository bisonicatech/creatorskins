import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Site-wide gate so this isn't publicly stumble-onto-able before real launch
// -- separate from real user auth (Supabase session) below, which still
// governs who can actually do anything once past this. Logins live in the
// SITE_AUTH_USERS env var as comma-separated name:password pairs, never
// hardcoded. SITE_AUTH_USER/SITE_AUTH_PASSWORD (single legacy pair) still
// works too, on top of whatever's in SITE_AUTH_USERS.
function allowedCredentials(): { user: string; pass: string }[] {
  const pairs: { user: string; pass: string }[] = [];
  for (const entry of (process.env.SITE_AUTH_USERS ?? "").split(",")) {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex === -1) continue;
    pairs.push({ user: entry.slice(0, separatorIndex).trim(), pass: entry.slice(separatorIndex + 1).trim() });
  }
  if (process.env.SITE_AUTH_USER && process.env.SITE_AUTH_PASSWORD) {
    pairs.push({ user: process.env.SITE_AUTH_USER, pass: process.env.SITE_AUTH_PASSWORD });
  }
  return pairs;
}

function hasValidBasicAuth(request: NextRequest): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const separatorIndex = decoded.indexOf(":");
  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);
  return allowedCredentials().some((c) => c.user === user && c.pass === pass);
}

export async function middleware(request: NextRequest) {
  if (!hasValidBasicAuth(request)) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="CreatorSkins"' },
    });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Refreshes the session token if expired — without this, server components/routes
  // can see a stale or missing session even though the browser still has a valid cookie.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|api/cron).*)"],
};
