import { createClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

export async function POST() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return jsonError("AUTH_ERROR", error.message, 500);
  }

  return jsonOk({ signedOut: true });
}
