import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

// The Clerk session token travels with every request this client makes.
// Policies read the organization off that token, so no query filters rows by
// organization itself.
export async function createServerSupabaseClient() {
  await connection();

  return createClient<Database>(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      accessToken: async () => (await auth()).getToken(),
    },
  );
}
