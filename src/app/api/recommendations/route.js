import { NextResponse } from "next/server";
import { getRecommendations } from "../../../services/recommendationEngine/index.js";
import {
  verifySessionToken,
  SESSION_COOKIE_NAME,
  OWNER_USERNAME,
} from "../../../server/auth.js";

/**
 * Resolves user identifier from query params, session cookie, or default
 */
function resolveUserId(request, paramUserId = null) {
  if (paramUserId && typeof paramUserId === "string" && paramUserId.trim()) {
    return paramUserId.trim().toLowerCase();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionCookie) {
    const session = verifySessionToken(sessionCookie);
    if (session?.username) {
      return session.username.trim().toLowerCase();
    }
  }

  return (OWNER_USERNAME || "guest").toLowerCase();
}

/**
 * GET /api/recommendations?limit=8&userId=...&seed=...&refresh=false
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "8", 10);
    const seed = parseInt(searchParams.get("seed") || "0", 10);
    const bypassCache = searchParams.get("refresh") === "true";
    const requestedUser = searchParams.get("userId") || searchParams.get("user_id");

    const userId = resolveUserId(request, requestedUser);

    const recommendations = getRecommendations(userId, limit, {
      seed,
      bypassCache,
    });

    return NextResponse.json({
      success: true,
      count: recommendations.length,
      limit,
      seed,
      userId,
      recommendations,
    });
  } catch (error) {
    console.error("[API Recommendations] Error generating recommendations:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to generate recommendations",
      },
      { status: 500 }
    );
  }
}

