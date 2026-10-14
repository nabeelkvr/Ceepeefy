import { NextResponse } from "next/server";
import {
  OWNER_USERNAME,
  verifyPassword,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
} from "../../../../server/auth.js";

export async function POST(request) {
  try {
    // Extract client IP for rate limiting
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";

    // Check rate limit
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: rateCheck.message,
          retryAfter: rateCheck.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.retryAfterSec),
          },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "Username and password are required." },
        { status: 400 }
      );
    }

    const cleanUser = String(username).trim().toLowerCase();
    const isUserMatch =
      cleanUser === OWNER_USERNAME ||
      cleanUser === `${OWNER_USERNAME}@ceepeefy.audio` ||
      cleanUser === `${OWNER_USERNAME}@gmail.com`;

    const isPassMatch = verifyPassword(String(password).trim());

    if (!isUserMatch || !isPassMatch) {
      recordFailedAttempt(ip);
      return NextResponse.json(
        {
          success: false,
          error: "Invalid credentials. Access denied.",
        },
        { status: 401 }
      );
    }

    // Login successful — reset rate limiter
    resetRateLimit(ip);

    // Generate secure session token
    const token = createSessionToken(OWNER_USERNAME);

    const isProd = process.env.NODE_ENV === "production";
    const response = NextResponse.json({
      success: true,
      user: {
        username: OWNER_USERNAME,
        name: OWNER_USERNAME,
        email: `${OWNER_USERNAME}@ceepeefy.audio`,
        plan: "Owner / Studio Master",
        isLoggedIn: true,
        activeUser: OWNER_USERNAME,
      },
    });

    // Set HttpOnly, Secure, SameSite=Lax session cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SEC,
    });

    return response;
  } catch (err) {
    console.error("[Login Route] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error during authentication." },
      { status: 500 }
    );
  }
}
