import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../services/supabaseServer.js";
import { SESSION_COOKIE_NAME } from "../../../../server/auth.js";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (e) {
    console.warn("[Auth API] Supabase signOut notice:", e);
  }

  const response = NextResponse.json({ success: true, message: "Logged out successfully." });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
  });
  return response;
}
