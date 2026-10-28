import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// The Clerk session token travels with every request this client makes.
// Policies read the organization off that token, so no query filters rows by
// organization itself.
export function createServerSupabaseClient() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    accessToken: async () => (await auth()).getToken(),
  });
}
