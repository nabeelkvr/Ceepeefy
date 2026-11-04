import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../services/supabaseServer.js";
import { validateAndNormalizeStoragePath } from "../../../server/storageValidator.js";

const BUCKET_NAME = "self-mixes";

export { validateAndNormalizeStoragePath };

/**
 * Supabase Storage Deletion API Route
 * Strictly prevents users from deleting files outside their own authenticated namespace.
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

    const pathCheck = validateAndNormalizeStoragePath(path, user);
    if (!pathCheck.valid) {
      return NextResponse.json(
        { success: false, error: pathCheck.error },
        { status: pathCheck.status || 400 }
      );
    }

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([pathCheck.normalizedPath]);

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
