import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../services/supabaseServer.js";

/**
 * Recently Played API Route
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
      .from("recently_played")
      .select("track_id, track_data, played_at")
      .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
      .order("played_at", { ascending: false })
      .limit(30);

    if (error && (error.code === "42703" || error.message?.includes("auth_user_id"))) {
      const fallback = await supabase
        .from("recently_played")
        .select("track_id, track_data, played_at")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false })
        .limit(30);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("[Recently Played API] GET error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const tracks = (data || []).map((row) => ({
      id: row.track_id,
      ...(row.track_data || {}),
      played_at: row.played_at,
    }));

    return NextResponse.json({ success: true, count: tracks.length, tracks });
  } catch (err) {
    console.error("[Recently Played API] GET exception:", err);
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
      played_at: new Date().toISOString(),
    };

    let { error } = await supabase.from("recently_played").insert([record]);

    if (error && (error.code === "42703" || error.message?.includes("auth_user_id"))) {
      const fallbackRecord = {
        user_id: user.id,
        track_id: String(track.id),
        track_data: track,
        played_at: new Date().toISOString(),
      };
      const fallback = await supabase.from("recently_played").insert([fallbackRecord]);
      error = fallback.error;
    }

    if (error) {
      console.error("[Recently Played API] POST error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, trackId: track.id });
  } catch (err) {
    console.error("[Recently Played API] POST exception:", err);
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

    const { error } = await supabase
      .from("recently_played")
      .delete()
      .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`);

    if (error) {
      console.error("[Recently Played API] DELETE error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Recently Played API] DELETE exception:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

