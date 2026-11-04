import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createSupabaseServerClient,
  isSupabaseServerConfigured,
} from "../../../../services/supabaseServer.js";
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
      console.warn(`[Auth API] Rate limit exceeded for IP: ${ip}`);
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

    // Upfront check: verify Supabase environment variables are configured
    if (!isSupabaseServerConfigured()) {
      console.error(
        "[Auth API] Supabase environment variables missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)"
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "Authentication service is not configured. Missing Supabase environment variables in this deployment environment. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are added to your Vercel Preview settings.",
        },
        { status: 503 }
      );
    }

    const targetEmail = resolveEmailForUser(rawUser);
    console.log(`[Auth API] Login attempt for identifier: "${rawUser}" (target email: "${targetEmail}") from IP: ${ip}`);

    // Capture cookies issued during signInWithPassword
    const capturedCookies = [];
    const supabase = await createSupabaseServerClient(capturedCookies);

    // Authenticate exclusively with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password: rawPass,
    });

    if (authError || !authData?.user) {
      console.warn(`[Auth API] Supabase login failed for "${rawUser}": ${authError?.message || "User not found"}`);
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

    console.log(`[Auth API] Login successful for user "${resolvedUsername}" (Auth UID: ${user.id}). Issuing Supabase Auth session.`);

    const response = NextResponse.json({
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
    });

    // Explicitly set all Supabase Auth session cookies into outgoing response with root path
    capturedCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        ...options,
      });
    });

    // Also mirror any cookies from cookieStore in case Next.js adapter set them there
    try {
      const cookieStore = await cookies();
      cookieStore.getAll().forEach((c) => {
        if (!response.cookies.get(c.name)) {
          response.cookies.set(c.name, c.value, {
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            httpOnly: true,
          });
        }
      });
    } catch (cookieErr) {
      console.warn("[Auth API] Notice copying cookieStore:", cookieErr.message);
    }

    return response;
  } catch (err) {
    console.error("[Auth API] Login exception:", err?.message || err);
    return NextResponse.json(
      {
        success: false,
        error:
          err?.message && !err.message.includes("database")
            ? err.message
            : "An unexpected error occurred during authentication. Please try again.",
      },
      { status: 500 }
    );
  }
}
