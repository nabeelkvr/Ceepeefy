import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../services/supabaseServer.js";
import { resolveEmailForUser, DEFAULT_USER_ID } from "../../../../config/authConfig.js";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
} from "../../../../server/auth.js";

export async function POST(request) {
  try {
    // Extract client IP for rate limiting protection
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";

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
    const { action = "login", username, email, password } = body;

    if (action === "signup") {
      return NextResponse.json(
        {
          success: false,
          error: "Signups are managed directly via Supabase Auth dashboard for single-user instance.",
        },
        { status: 403 }
      );
    }

    const rawUser = String(username || email || "").trim();
    const rawPass = String(password || "").trim();

    if (!rawUser || !rawPass) {
      return NextResponse.json(
        { success: false, error: "Please enter your username/email and password." },
        { status: 400 }
      );
    }

    const targetEmail = resolveEmailForUser(rawUser);
    const supabase = await createSupabaseServerClient();

    // Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password: rawPass,
    });

    if (authError || !authData?.user) {
      recordFailedAttempt(ip);
      return NextResponse.json(
        {
          success: false,
          error: authError?.message || "Invalid credentials. Please verify your password in Supabase Auth.",
        },
        { status: 401 }
      );
    }

    resetRateLimit(ip);

    const user = authData.user;
    const resolvedUsername = rawUser.includes("@") ? (user.user_metadata?.username || DEFAULT_USER_ID) : rawUser;

    return NextResponse.json({
      success: true,
      message: "Successfully signed in with Supabase Auth.",
      user: {
        id: user.id,
        uid: user.id,
        username: resolvedUsername,
        email: user.email,
        name: user.user_metadata?.full_name || resolvedUsername,
        plan: "Owner / Studio Master",
        isLoggedIn: true,
      },
      session: {
        access_token: authData.session.access_token,
        expires_at: authData.session.expires_at,
      },
    });
  } catch (err) {
    console.error("[Auth API] Login exception:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Authentication error occurred." },
      { status: 500 }
    );
  }
}
