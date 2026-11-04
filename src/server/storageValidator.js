/**
 * Validates and normalizes a storage file path.
 * - Protects against null bytes, control characters, backslashes, absolute paths.
 * - Protects against segment-level directory traversal (. and ..).
 * - Handles malformed URL encodings safely.
 * - Strictly enforces user namespace isolation.
 */
export function validateAndNormalizeStoragePath(rawPath, user) {
  if (!rawPath || typeof rawPath !== "string") {
    return { valid: false, error: "Path is required.", status: 400 };
  }

  // 1. Safe URL decoding (catch malformed percent-encoding)
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return { valid: false, error: "Malformed URL encoding in path.", status: 400 };
  }

  // 2. Reject null bytes or control characters
  if (/[\0\x00-\x1f\x7f]/.test(decoded)) {
    return { valid: false, error: "Path contains invalid control characters.", status: 400 };
  }

  // 3. Reject backslashes or backslash-based traversal
  if (decoded.includes("\\")) {
    return { valid: false, error: "Backslashes are not permitted in storage paths.", status: 400 };
  }

  // 4. Reject absolute path indicators (leading slashes, drive letters, protocols)
  if (decoded.startsWith("/") || /^[a-zA-Z]:/.test(decoded) || /^[a-zA-Z]+:\/\//.test(decoded)) {
    return { valid: false, error: "Absolute paths and URL protocols are not permitted.", status: 400 };
  }

  // 5. Split by forward slash and inspect every individual segment
  const segments = decoded.split("/").filter((s) => s.length > 0);

  if (segments.length < 2) {
    return { valid: false, error: "Invalid path depth: must include user namespace and filename.", status: 400 };
  }

  for (const seg of segments) {
    // Reject '.' (current dir), '..' (parent dir traversal), or whitespace-only segments
    if (seg === "." || seg === ".." || seg.trim().length === 0) {
      return { valid: false, error: "Directory traversal segments (. or ..) are forbidden.", status: 400 };
    }
    // Deep inspection: reject any segment containing '..'
    if (seg.includes("..")) {
      return { valid: false, error: "Directory traversal sequences are forbidden.", status: 400 };
    }
  }

  // 6. Namespace Authorization: First segment must match user's authenticated UUID or verified legacy mapping
  const rootNamespace = segments[0];
  const isOwnerUuid = rootNamespace === user.id;
  const isVerifiedLegacyOwner = user.email === "nabeelek3603@gmail.com" && rootNamespace === "nabeeyl";

  if (!isOwnerUuid && !isVerifiedLegacyOwner) {
    return {
      valid: false,
      error: "Forbidden: You may only access files within your own storage namespace.",
      status: 403,
    };
  }

  return {
    valid: true,
    normalizedPath: segments.join("/"),
  };
}

