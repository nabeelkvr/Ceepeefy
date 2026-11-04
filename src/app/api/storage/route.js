import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../services/supabaseServer.js";

const BUCKET_NAME = "self-mixes";

/**
 * Supabase Storage Deletion API Route
 * Strictly prevents users from deleting files outside their own authenticated `${user.id}/` prefix.
 */
export async function DELETE(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Valid Supabase session required." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    let path = searchParams.get("path");

    if (!path) {
      const body = await request.json().catch(() => ({}));
      path = body.path;
    }

    if (!path || typeof path !== "string") {
      return NextResponse.json({ success: false, error: "path is required" }, { status: 400 });
    }

    // Decode URI component if passed URL-encoded
    const decodedPath = decodeURIComponent(path).replace(/^\/+/, "");

    // STRICT ISOLATION CHECK: Path must begin with user's UUID
    // For backward-compatibility with pre-migration records, allow user.id or 'nabeeyl'
    const allowedPrefixes = [`${user.id}/`];
    if (user.email === "nabeelek3603@gmail.com") {
      allowedPrefixes.push("nabeeyl/");
    }

    const isAuthorized = allowedPrefixes.some((prefix) => decodedPath.startsWith(prefix));

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You may only delete files in your own user directory." },
        { status: 403 }
      );
    }

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([decodedPath]);

    if (error) {
      console.error("[Storage API] DELETE error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, removed: data });
  } catch (err) {
    console.error("[Storage API] DELETE exception:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

