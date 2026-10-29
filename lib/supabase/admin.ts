import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * The pipeline's writer, and nothing else. A run outlives the request and the
 * session token that started it, so it writes with the secret key, which
 * bypasses row policies. Every write here is therefore responsible for its own
 * organization_id; everything a person reads still goes through
 * createServerSupabaseClient and the policies.
 */
export function createPipelineSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
