import { withAuth } from "@/lib/backend/auth/handler";
import { jsonOk } from "@/lib/backend/utils/json";

export async function GET() {
  return withAuth(async (auth) => {
    return jsonOk({
      user: {
        id: auth.user.id,
        email: auth.user.email,
      },
      tenantId: auth.tenantId,
      role: auth.role,
    });
  });
}
