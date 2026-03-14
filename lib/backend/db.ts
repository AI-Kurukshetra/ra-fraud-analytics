import "server-only";

import { createClient } from "@supabase/supabase-js";

function getRequired(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createAdminClient() {
  const url = getRequired("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequired("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
