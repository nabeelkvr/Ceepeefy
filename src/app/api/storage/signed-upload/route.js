import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../services/supabaseServer.js";

const BUCKET_NAME = "self-mixes";

/**
 * Storage Signed Upload API Route
 * Issues short-lived, authorized signed upload URLs for client-side upload to Supabase Storage.
 * Strictly scopes upload destination to `${user.id}/...`
 */
export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Valid Supabase session required." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { fileName, fileType, folder, playlistId, upsert } = body;

    if (!fileName) {
      return NextResponse.json({ success: false, error: "fileName is required" }, { status: 400 });
    }

    let filePath;
    const isCover = folder === "covers" || fileType?.startsWith("image/");

    if (isCover) {
      // Validate cover image formats
      const isImage =
        /\.(jpe?g|png|webp|gif)$/i.test(fileName) ||
        (fileType && fileType.startsWith("image/"));

      if (!isImage) {
        return NextResponse.json(
          { success: false, error: "Invalid image format. Supported formats: .jpg, .png, .webp, .gif" },
          { status: 400 }
        );
      }

      let extension = "jpg";
      if (fileType?.includes("png") || fileName.endsWith(".png")) extension = "png";
      else if (fileType?.includes("webp") || fileName.endsWith(".webp")) extension = "webp";
      else if (fileType?.includes("gif") || fileName.endsWith(".gif")) extension = "gif";

      const cleanId = String(playlistId || `cover-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
      filePath = `${user.id}/covers/${cleanId}_${Date.now()}.${extension}`;
    } else {
      // Validate audio file formats
      const isAudio =
        /\.(mp3|wav)$/i.test(fileName) ||
        fileType === "audio/mpeg" ||
        fileType === "audio/wav" ||
        fileType === "audio/x-wav";

      if (!isAudio) {
        return NextResponse.json(
          { success: false, error: "Invalid audio format. Supported formats: .mp3, .wav" },
          { status: 400 }
        );
      }

      const cleanFileName = String(fileName)
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .toLowerCase();
      filePath = `${user.id}/${Date.now()}_${cleanFileName}`;
    }

    // Generate signed upload URL from Supabase Storage
    const { data: signedData, error: signError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(filePath, {
        upsert: Boolean(upsert),
      });

    if (signError || !signedData) {
      console.error("[Storage Signed-Upload API] Failed to generate signed URL:", signError?.message);
      return NextResponse.json(
        { success: false, error: signError?.message || "Failed to create signed upload URL." },
        { status: 500 }
      );
    }

    // Resolve public URL for playback or image display
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      bucket: BUCKET_NAME,
      path: filePath,
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      publicUrl: urlData.publicUrl,
    });
  } catch (err) {
    console.error("[Storage Signed-Upload API] Exception:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to generate upload URL." },
      { status: 500 }
    );
  }
}

