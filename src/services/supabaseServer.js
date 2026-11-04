import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Checks whether Supabase environment variables are properly configured
 */
export function isSupabaseServerConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  return Boolean(url && key && !url.includes("your-project-id"));
}

/**
 * Creates a Supabase client for Server Components, Route Handlers, and Server Actions
 * using Next.js cookies via @supabase/ssr.
 * 
 * @param {Array} [cookieCapture] - Optional array to capture cookies issued or cleared by Supabase Auth
 */
export async function createSupabaseServerClient(cookieCapture = null) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase configuration is missing. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables are configured."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (Array.isArray(cookieCapture)) {
          cookieCapture.push(...cookiesToSet);
        }
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing sessions.
        }
      },
    },
  });
}


