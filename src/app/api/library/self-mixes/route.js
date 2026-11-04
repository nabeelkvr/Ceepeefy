import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../services/supabaseServer.js";

/**
 * Self Mixes API Route
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
      .from("self_mixes")
      .select("*")
      .or(`auth_user_id.eq.${user.id},owner.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error && (error.code === "42703" || error.message?.includes("auth_user_id"))) {
      const fallback = await supabase
        .from("self_mixes")
        .select("*")
        .eq("owner", user.id)
        .order("created_at", { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("[Self Mixes API] GET error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: (data || []).length, mixes: data || [] });
  } catch (err) {
    console.error("[Self Mixes API] GET exception:", err);
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
    const { mix } = body;

    if (!mix) {
      return NextResponse.json({ success: false, error: "Mix data required" }, { status: 400 });
    }

    const record = {
      id: mix.id || `cloud-mix-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      title: mix.title || "Untitled Self Mix",
      audio_url: mix.audioUrl || mix.audio_url,
      owner: user.id,
      auth_user_id: user.id,
      duration: typeof mix.duration === "number" ? Math.round(mix.duration) : 180,
      duration_formatted: mix.durationFormatted || mix.duration_formatted || "3:00",
      file_name: mix.fileName || mix.file_name || "",
      file_size: mix.fileSize || mix.file_size || 0,
      cover_url:
        mix.coverUrl ||
        mix.cover_url ||
        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
      created_at: new Date().toISOString(),
    };

    let { data, error } = await supabase
      .from("self_mixes")
      .insert([record])
      .select()
      .single();

    if (error && (error.code === "42703" || error.message?.includes("auth_user_id"))) {
      const fallbackRecord = { ...record };
      delete fallbackRecord.auth_user_id;
      const fallback = await supabase
        .from("self_mixes")
        .insert([fallbackRecord])
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("[Self Mixes API] POST error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, mix: data });
  } catch (err) {
    console.error("[Self Mixes API] POST exception:", err);
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
    let id = searchParams.get("id");

    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("self_mixes")
      .delete()
      .eq("id", id)
      .or(`auth_user_id.eq.${user.id},owner.eq.${user.id}`);

    if (error) {
      console.error("[Self Mixes API] DELETE error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    console.error("[Self Mixes API] DELETE exception:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

