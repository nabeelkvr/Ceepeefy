import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../services/supabaseServer.js";

/**
 * Liked Songs API Route
 * Scoped strictly to authenticated user's session
 */

export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let { data, error } = await supabase
      .from("liked_songs")
      .select("track_id, track_data, created_at")
      .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    // Fallback if schema does not yet have auth_user_id
    if (error && (error.code === "42703" || error.message?.includes("auth_user_id"))) {
      const fallback = await supabase
        .from("liked_songs")
        .select("track_id, track_data, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("[Liked Songs API] GET error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const tracks = (data || []).map((row) => ({
      id: row.track_id,
      ...(row.track_data || {}),
      created_at: row.created_at,
    }));

    return NextResponse.json({ success: true, count: tracks.length, tracks });
  } catch (err) {
    console.error("[Liked Songs API] GET exception:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { track } = body;

    if (!track || !track.id) {
      return NextResponse.json({ success: false, error: "Track data with ID required" }, { status: 400 });
    }

    const record = {
      user_id: user.id,
      auth_user_id: user.id,
      track_id: String(track.id),
      track_data: track,
      created_at: new Date().toISOString(),
    };

    let { error } = await supabase
      .from("liked_songs")
      .upsert(record, { onConflict: "user_id,track_id" });

    if (error && (error.code === "42703" || error.message?.includes("auth_user_id"))) {
      const fallbackRecord = {
        user_id: user.id,
        track_id: String(track.id),
        track_data: track,
        created_at: new Date().toISOString(),
      };
      const fallback = await supabase
        .from("liked_songs")
        .upsert(fallbackRecord, { onConflict: "user_id,track_id" });
      error = fallback.error;
    }

    if (error) {
      console.error("[Liked Songs API] POST error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, trackId: track.id });
  } catch (err) {
    console.error("[Liked Songs API] POST exception:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let trackId = searchParams.get("trackId");

    if (!trackId) {
      const body = await request.json().catch(() => ({}));
      trackId = body.trackId;
    }

    if (!trackId) {
      return NextResponse.json({ success: false, error: "trackId is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("liked_songs")
      .delete()
      .eq("track_id", String(trackId))
      .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`);

    if (error) {
      console.error("[Liked Songs API] DELETE error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, trackId });
  } catch (err) {
    console.error("[Liked Songs API] DELETE exception:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

