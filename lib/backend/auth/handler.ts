import { jsonError } from "@/lib/backend/utils/json";
import { requireAuthContext, requireRole, type AuthContext } from "@/lib/backend/auth/tenant-guard";

type AuthOptions = {
  allowedRoles?: AuthContext["role"][];
};

export async function withAuth(
  handler: (ctx: AuthContext) => Promise<Response>,
  options?: AuthOptions,
): Promise<Response> {
  try {
    const auth = await requireAuthContext();
    if (options?.allowedRoles && options.allowedRoles.length > 0) {
      requireRole(auth, options.allowedRoles);
    }
    return await handler(auth);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown auth error";
    if (message === "Unauthorized") {
      return jsonError("UNAUTHORIZED", message, 401);
    }
    if (message === "Missing x-tenant-id header") {
      return jsonError("BAD_REQUEST", message, 400);
    }
    if (message === "Invalid x-tenant-id header") {
      return jsonError("BAD_REQUEST", message, 400);
    }
    if (message === "Forbidden for tenant" || message === "Insufficient role") {
      return jsonError("FORBIDDEN", message, 403);
    }
    return jsonError("AUTH_ERROR", message, 500);
  }
}
