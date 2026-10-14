import { NextResponse } from "next/server";
import {
  OWNER_USERNAME,
  verifySessionToken,
  SESSION_COOKIE_NAME,
} from "../../../../server/auth.js";

export async function GET(request) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    const session = verifySessionToken(sessionCookie);
    if (!session) {
      // Clear invalid cookie
      const res = NextResponse.json({ authenticated: false, user: null });
      res.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: "",
        path: "/",
        maxAge: 0,
      });
      return res;
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        username: session.username || OWNER_USERNAME,
        name: session.username || OWNER_USERNAME,
        email: `${session.username || OWNER_USERNAME}@ceepeefy.audio`,
        plan: "Owner / Studio Master",
        isLoggedIn: true,
        activeUser: session.username || OWNER_USERNAME,
      },
    });
  } catch (err) {
    console.error("[Session Route] Error:", err);
    return NextResponse.json({ authenticated: false, user: null });
  }
}
