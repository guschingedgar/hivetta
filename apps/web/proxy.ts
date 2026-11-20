import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, OPEN, accessToken } from "@/lib/access";

// Next.js 16 "proxy" (formerly middleware): refreshes the Supabase session
// cookie on page requests. The MCP endpoint authenticates by bearer token and
// is excluded.
export async function proxy(request: NextRequest) {
  // Private beta: with HIVETTA_ACCESS_CODE set, every page asks for the code once per browser.
  const locked = await accessGate(request);
  if (locked) return locked;

  let response = NextResponse.next({ request });

  // The standalone front-end preview has no Supabase configuration.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          // Responses carrying auth cookies must never be cached and served to someone else.
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    },
  );

  await supabase.auth.getClaims();
  return response;
}

async function accessGate(request: NextRequest): Promise<NextResponse | null> {
  const code = process.env.HIVETTA_ACCESS_CODE?.trim();
  if (!code) return null;
  const { pathname, search } = request.nextUrl;
  if (OPEN.test(pathname)) return null;
  if (request.cookies.get(ACCESS_COOKIE)?.value === (await accessToken(code))) return null;
  const url = request.nextUrl.clone();
  url.pathname = "/locked";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  const res = NextResponse.redirect(url);
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/mcp|\\.well-known).*)"],
};
