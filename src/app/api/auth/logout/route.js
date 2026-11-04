import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "../../../../services/supabaseServer.js";
import { SESSION_COOKIE_NAME } from "../../../../server/auth.js";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (e) {
    console.warn("[Auth API] Supabase signOut notice:", e?.message || e);
  }

  const response = NextResponse.json({ success: true, message: "Logged out successfully." });

  // 1. Clear the Ceepeefy session token
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
  });

  // 2. Clear all Supabase Auth session cookies
  try {
    const cookieStore = await cookies();
    cookieStore.getAll().forEach((c) => {
      if (c.name.startsWith("sb-")) {
        response.cookies.set({
          name: c.name,
          value: "",
          path: "/",
          maxAge: 0,
        });
      }
    });
  } catch (err) {
    console.warn("[Auth API] Error clearing cookies:", err?.message || err);
  }

  return response;
}
