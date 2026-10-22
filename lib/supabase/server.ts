import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface ServerSupabaseConfig {
  url: string;
  anonKey: string;
}

export function getServerSupabaseConfig(): ServerSupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function extractBearerToken(
  authorization: string | null | undefined,
): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/**
 * Creates a request-scoped client that uses the user's access token. This keeps
 * RLS active and never uses a service-role key.
 */
export function createUserSupabaseClient(
  accessToken: string,
): SupabaseClient | null {
  const config = getServerSupabaseConfig();
  if (!config) return null;

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
