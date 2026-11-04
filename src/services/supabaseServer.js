import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv, isSupabaseServerConfigured } from "../server/supabaseEnv.js";

export { getSupabaseEnv, isSupabaseServerConfigured };

/**
 * Creates a Supabase client for Server Components, Route Handlers, and Server Actions
 * using Next.js cookies via @supabase/ssr.
 * 
 * @param {Array} [cookieCapture] - Optional array to capture cookies issued or cleared by Supabase Auth
 */
export async function createSupabaseServerClient(cookieCapture = null) {
  const { url, key, isConfigured } = getSupabaseEnv();

  if (!isConfigured) {
    throw new Error(
      "Supabase configuration is missing or invalid. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables are configured."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
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



