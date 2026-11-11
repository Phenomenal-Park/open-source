import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { detectLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Language: manual choice (cookie) > browser language > English (§5)
  if (pathname === "/") {
    const saved = req.cookies.get(LOCALE_COOKIE)?.value;
    const locale = isLocale(saved) ? saved : detectLocale(req.headers.get("accept-language"));
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}`;
    return NextResponse.redirect(url, 307);
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const res = NextResponse.next();
    if (process.env.MSM_LOCAL_DB_URL && process.env.NODE_ENV !== "production") {
      if (!req.cookies.get("msm_local_admin")) return NextResponse.redirect(new URL("/admin/login", req.url));
      return res;
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.redirect(new URL("/admin/login", req.url));
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    });
    const { data } = await supabase.auth.getUser(); // refreshes session cookies when needed
    if (!data.user) return NextResponse.redirect(new URL("/admin/login", req.url));
    return res;
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/admin/:path*"] };
