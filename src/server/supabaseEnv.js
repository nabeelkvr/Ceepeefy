/**
 * Supabase Environment Variable Resolver
 * Pure utility without Next.js runtime dependencies (safe for tests, serverless, edge).
 * Normalizes quotes, whitespace, and checks standard + fallback variable names.
 */
export function getSupabaseEnv() {
  const env = (typeof process !== "undefined" && process.env) ? process.env : {};

  const rawUrl =
    env.NEXT_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL ||
    env["NEXT_PUBLIC_SUPABASE_URL"] ||
    env["SUPABASE_URL"] ||
    "";

  const rawKey =
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_KEY ||
    env.SUPABASE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ||
    env["SUPABASE_ANON_KEY"] ||
    env["NEXT_PUBLIC_SUPABASE_KEY"] ||
    env["SUPABASE_KEY"] ||
    env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ||
    "";

  const cleanUrl = String(rawUrl)
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();

  const cleanKey = String(rawKey)
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();

  const isConfigured = Boolean(
    cleanUrl &&
    cleanKey &&
    !cleanUrl.includes("your-project-id") &&
    cleanUrl.startsWith("http")
  );

  return {
    url: cleanUrl,
    key: cleanKey,
    isConfigured,
  };
}

export function isSupabaseServerConfigured() {
  return getSupabaseEnv().isConfigured;
}
