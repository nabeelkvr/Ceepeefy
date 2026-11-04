import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { validateRequestOrigin } from "./server/csrf.js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

/**
 * Next.js 16 Proxy Convention (replaces middleware)
 * Enforces authoritative authentication via Supabase Auth server verification.
 */
export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // 1. Allow public static assets and files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/audio") || // Public audio proxy
    pathname.startsWith("/api/social") || // Public social downloader proxy
    pathname.startsWith("/media/") || // Public media assets
    pathname === "/favicon.ico" ||
    pathname === "/favicon.svg" ||
    pathname === "/favicon.png" ||
    pathname === "/logo.png" ||
    pathname === "/manifest.json" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icon-") ||
    pathname.startsWith("/apple-touch-icon") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".mp4") ||
    pathname.endsWith(".mp3")
  ) {
    return NextResponse.next();
  }

  // 2. Validate request origin for state-changing API requests (CSRF protection)
  if (pathname.startsWith("/api/")) {
    const originCheck = validateRequestOrigin(request);
    if (!originCheck.valid) {
      return NextResponse.json(
        { success: false, error: originCheck.error || "Forbidden: Invalid request origin." },
        { status: 403 }
      );
    }
  }

  // 3. Allow public authentication API endpoints
  if (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/session" ||
    pathname === "/api/auth/logout"
  ) {
    return NextResponse.next();
  }

  // 4. Cryptographically verify Supabase Auth session via getUser()
  // Do NOT trust mere presence of cookies; validate with Supabase Auth server
  let response = NextResponse.next({ request });

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      });

      const { data: { user }, error } = await supabase.auth.getUser();

      if (user && !error) {
        // Authenticated user verified by Supabase Auth: redirect away from /login to home
        if (pathname === "/login") {
          return NextResponse.redirect(new URL("/", request.url));
        }
        return response;
      }
    } catch (err) {
      console.warn("[Proxy] Supabase session verification notice:", err?.message || err);
    }
  }

  // 5. Handle unauthenticated requests
  // Allow unauthenticated visitors to view /login stably without looping
  if (pathname === "/login") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized: Private instance. Authentication required.",
        code: "UNAUTHORIZED",
      },
      { status: 401 }
    );
  }

  // If unauthenticated navigation: redirect to /login
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     */
    "/((?!_next/static|_next/image).*)",
  ],
};
