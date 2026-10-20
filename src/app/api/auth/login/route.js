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

// In-memory registry for user signups during server session
const REGISTERED_USERS = new Map();

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

    const rawUser = String(username || email || displayName || "").trim();
    const cleanUser = rawUser.toLowerCase();
    const rawPass = String(password || "").trim();

    // 1. SIGNUP ACTION
    if (action === "signup") {
      if (!rawPass || (!email && !rawUser)) {
        return NextResponse.json(
          { success: false, error: "Please enter your email and a password to create an account." },
          { status: 400 }
        );
      }

      if (rawPass.length < 4) {
        return NextResponse.json(
          { success: false, error: "Password must be at least 4 characters long." },
          { status: 400 }
        );
      }

      const chosenName = (displayName || rawUser.split("@")[0] || "Music Lover").trim();
      const chosenEmail = (email || `${chosenName.toLowerCase().replace(/\s+/g, "")}@ceepeefy.audio`).trim();

      // Register user in memory
      const profile = {
        username: chosenName,
        password: rawPass,
        name: chosenName,
        email: chosenEmail,
        plan: "Free",
      };
      REGISTERED_USERS.set(chosenEmail.toLowerCase(), profile);
      REGISTERED_USERS.set(chosenName.toLowerCase(), profile);

      resetRateLimit(ip);
      const token = createSessionToken(chosenName);
      const isProd = process.env.NODE_ENV === "production";

      const response = NextResponse.json({
        success: true,
        user: {
          username: chosenName,
          name: chosenName,
          email: chosenEmail,
          plan: "Free",
          isLoggedIn: true,
          activeUser: chosenName,
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

    // 2. LOGIN ACTION
    if (!cleanUser || !rawPass) {
      return NextResponse.json(
        { success: false, error: "Please enter your username/email and password." },
        { status: 400 }
      );
    }

    // Check if Owner credentials
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

    // Check if previously signed-up user in this session
    const registered = REGISTERED_USERS.get(cleanUser);
    if (registered && registered.password === rawPass) {
      resetRateLimit(ip);
      const token = createSessionToken(registered.username);
      const isProd = process.env.NODE_ENV === "production";
      const response = NextResponse.json({
        success: true,
        user: {
          username: registered.username,
          name: registered.name,
          email: registered.email,
          plan: registered.plan || "Free",
          isLoggedIn: true,
          activeUser: registered.username,
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

    // Flexible login for new members with valid password
    if (rawPass.length >= 4) {
      const displayName = rawUser.includes("@") ? rawUser.split("@")[0] : rawUser;
      resetRateLimit(ip);
      const token = createSessionToken(displayName);
      const isProd = process.env.NODE_ENV === "production";
      const response = NextResponse.json({
        success: true,
        user: {
          username: displayName,
          name: displayName,
          email: cleanUser.includes("@") ? cleanUser : `${displayName}@ceepeefy.audio`,
          plan: "Free",
          isLoggedIn: true,
          activeUser: displayName,
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
        error: "Invalid credentials. Password must be at least 4 characters.",
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
