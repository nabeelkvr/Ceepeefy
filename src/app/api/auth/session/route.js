import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../services/supabaseServer.js";
import { DEFAULT_USER_ID } from "../../../../config/authConfig.js";

export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ authenticated: false, user: null });
    }

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
  } catch (err) {
    console.error("[Session Route] Error:", err);
    return NextResponse.json({ authenticated: false, user: null });
  }
}
