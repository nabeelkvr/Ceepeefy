import { NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "./server/auth.js";

/**
 * Next.js 16 Proxy Convention (replaces middleware)
 * Protects page routes and sensitive API endpoints against unauthenticated access.
 */
export function proxy(request) {
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

  // 2. Allow public authentication endpoints
  if (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/session" ||
    pathname === "/api/auth/logout"
  ) {
    return NextResponse.next();
  }

  // 3. Verify session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(sessionCookie);

  // 4. Handle unauthenticated requests
  if (!session) {
    // If it's an API route: return 401 Unauthorized
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

    // If it's a page navigation: redirect to /login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 5. Authenticated: pass through
  return NextResponse.next();
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
