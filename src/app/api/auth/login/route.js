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
    const { action = "login", username, email, password, displayName } = body;

    // 1. SIGNUP IS COMPLETELY DISABLED
    if (action === "signup") {
      return NextResponse.json(
        {
          success: false,
          error: "Signups are disabled. Ceepeefy is a personal single-account instance. Please log in.",
        },
        { status: 403 }
      );
    }

    // 2. LOGIN ACTION (Single account: nabeeyl / 963963)
    const rawUser = String(username || email || displayName || "").trim();
    const cleanUser = rawUser.toLowerCase();
    const rawPass = String(password || "").trim();

    if (!cleanUser || !rawPass) {
      return NextResponse.json(
        { success: false, error: "Please enter your username/email and password." },
        { status: 400 }
      );
    }

    // Single account verification
    const isOwnerUser =
      cleanUser === OWNER_USERNAME ||
      cleanUser === `${OWNER_USERNAME}@ceepeefy.audio` ||
      cleanUser === `${OWNER_USERNAME}@gmail.com`;

    if (isOwnerUser && verifyPassword(rawPass)) {
      resetRateLimit(ip);
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
    }

    recordFailedAttempt(ip);
    return NextResponse.json(
      {
        success: false,
        error: "Invalid username or password.",
      },
      { status: 401 }
    );
  } catch (err) {
    console.error("[Login Route] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error during authentication." },
      { status: 500 }
    );
  }
}
