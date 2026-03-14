import type { User } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function requireUser(): Promise<User> {
  const serverClient = await createServerClient();
  const {
    data: { user },
    error,
  } = await serverClient.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return user;
}

export function sanitizeTenantSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
