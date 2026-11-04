import { NextResponse } from "next/server";
import { getSupabaseEnv } from "../../../../services/supabaseServer.js";

/**
 * Sanitized Server Diagnostic Endpoint
 * Reports configuration existence, git metadata, and deployment health WITHOUT revealing any secret keys or values.
 */
export async function GET() {
  const { url, key, isConfigured } = getSupabaseEnv();
  const env = process.env || {};

  const allEnvKeys = Object.keys(env);
  const supabaseKeys = allEnvKeys.filter((k) => /supabase/i.test(k));

  const diagnostics = {
    timestamp: new Date().toISOString(),
    git: {
      commitSha: env.VERCEL_GIT_COMMIT_SHA || env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "local",
      commitRef: env.VERCEL_GIT_COMMIT_REF || env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF || "fix/playlist-sync",
      commitMessage: env.VERCEL_GIT_COMMIT_MESSAGE || "local",
    },
    vercel: {
      env: env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
      url: env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "unknown",
      branchUrl: env.VERCEL_BRANCH_URL ? `https://${env.VERCEL_BRANCH_URL}` : "unknown",
      projectProductionUrl: env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "unknown",
      region: env.VERCEL_REGION || "unknown",
    },
    supabaseConfig: {
      isConfigured,
      urlDiagnostics: {
        present: Boolean(url),
        length: url ? url.length : 0,
        startsWithHttp: url ? url.startsWith("http") : false,
        isSupabaseCo: url ? url.includes(".supabase.co") : false,
        hasQuotes: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && /^["'].*["']$/.test(env.NEXT_PUBLIC_SUPABASE_URL)),
        hasWhitespace: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL !== env.NEXT_PUBLIC_SUPABASE_URL.trim()),
      },
      keyDiagnostics: {
        present: Boolean(key),
        length: key ? key.length : 0,
        isJwtStructure: key ? key.split(".").length === 3 : false,
        hasQuotes: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY && /^["'].*["']$/.test(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)),
        hasWhitespace: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim()),
      },
      detectedVariableNames: {
        NEXT_PUBLIC_SUPABASE_URL: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
        SUPABASE_URL: Boolean(env.SUPABASE_URL),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        SUPABASE_ANON_KEY: Boolean(env.SUPABASE_ANON_KEY),
        NEXT_PUBLIC_SUPABASE_KEY: Boolean(env.NEXT_PUBLIC_SUPABASE_KEY),
        SUPABASE_KEY: Boolean(env.SUPABASE_KEY),
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      },
      matchingEnvKeyNames: supabaseKeys,
    },
  };

  return NextResponse.json(diagnostics, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
