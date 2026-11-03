import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../services/supabaseServer.js";

/**
 * Playlists API Route
 * D2: Single source of truth is Supabase PostgreSQL (user_playlists & playlist_tracks).
 * Server disk and memory storage write paths are completely eliminated.
 */

export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Authenticated session required." },
        { status: 401 }
      );
    }

    // Fetch playlists belonging to authenticated user
    const { data: playlists, error: plError } = await supabase
      .from("user_playlists")
      .select("*")
      .is("deleted_at", null)
      .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
      .order("updated_at", { ascending: false });

    if (plError) {
      return NextResponse.json(
        { success: false, error: plError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      userId: user.id,
      count: playlists?.length || 0,
      playlists: playlists || [],
    });
  } catch (err) {
    console.error("[Playlists API] GET error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch playlists." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { playlist } = body;

    if (!playlist || !playlist.id) {
      return NextResponse.json(
        { success: false, error: "Playlist data with a valid ID is required." },
        { status: 400 }
      );
    }

    // Direct metadata upsert into user_playlists
    const payload = {
      id: playlist.id,
      auth_user_id: user.id,
      user_id: user.id,
      title: playlist.title || "Untitled Playlist",
      description: playlist.description || "",
      cover_url: playlist.coverUrl || playlist.cover_url || null,
      category: playlist.category || "Mixed",
      curator: playlist.curator || "You",
      curator_avatar: playlist.curatorAvatar || "",
      badge: playlist.badge || "CUSTOM",
      badge_variant: playlist.badgeVariant || "purple",
      fidelity: playlist.fidelity || "Personal Playlist • Hi-Res Lossless",
      spec: playlist.spec || "24-Bit • 192kHz",
      kind: playlist.kind || "user",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("user_playlists")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, playlist: data });
  } catch (err) {
    console.error("[Playlists API] POST error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to save playlist." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Playlist ID is required." },
        { status: 400 }
      );
    }

    // Soft delete per D3.e (setting deleted_at)
    const { error } = await supabase
      .from("user_playlists")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    console.error("[Playlists API] DELETE error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to delete playlist." },
      { status: 500 }
    );
  }
}
