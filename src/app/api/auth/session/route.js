import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../services/supabaseServer.js";
import { DEFAULT_USER_ID, resolveEmailForUser } from "../../../../config/authConfig.js";
import { verifySessionToken, SESSION_COOKIE_NAME } from "../../../../server/auth.js";

export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (user && !error) {
      const username = user.user_metadata?.username || DEFAULT_USER_ID;
      return NextResponse.json({
        authenticated: true,
        user: {
          id: user.id,
          uid: user.id,
          username,
          name: user.user_metadata?.full_name || username,
          email: user.email,
          plan: "Owner / Studio Master",
          isLoggedIn: true,
          activeUser: username,
        },
      });
    }

    // Secondary fallback: verify session token cookie
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(sessionCookie);
    if (session) {
      const username = session.username || DEFAULT_USER_ID;
      return NextResponse.json({
        authenticated: true,
        user: {
          id: username,
          uid: username,
          username,
          name: username,
          email: resolveEmailForUser(username),
          plan: "Owner / Studio Master",
          isLoggedIn: true,
          activeUser: username,
        },
      });
    }

    return NextResponse.json({ authenticated: false, user: null });
  } catch (err) {
    console.error("[Session Route] Error:", err?.message || err);
    return NextResponse.json({ authenticated: false, user: null });
  }
}
