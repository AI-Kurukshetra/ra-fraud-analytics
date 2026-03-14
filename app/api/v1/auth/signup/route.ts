import { createAdminClient } from "@/lib/backend/db";
import { sanitizeTenantSlug } from "@/lib/backend/auth/user-guard";
import { jsonError, jsonOk } from "@/lib/backend/utils/json";

type SignupBody = {
  email?: unknown;
  password?: unknown;
  tenantName?: unknown;
  tenantSlug?: unknown;
};

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

function isValidEmail(value: string) {
  return value.includes("@") && value.includes(".");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SignupBody | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const tenantName = typeof body?.tenantName === "string" ? body.tenantName.trim() : "";
  const tenantSlugInput = typeof body?.tenantSlug === "string" ? body.tenantSlug.trim() : "";

  if (!email || !isValidEmail(email)) {
    return jsonError("VALIDATION_ERROR", "Valid email is required", 400);
  }
  if (!password || password.length < 8) {
    return jsonError("VALIDATION_ERROR", "password must be at least 8 characters", 400);
  }
  if (!tenantName || tenantName.length < 3 || tenantName.length > 80) {
    return jsonError("VALIDATION_ERROR", "tenantName must be between 3 and 80 characters", 400);
  }

  const admin = createAdminClient();
  const { data: authUser, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createUserError || !authUser.user) {
    const message = createUserError?.message ?? "Unable to create user";
    const status = message.toLowerCase().includes("already") ? 409 : 500;
    return jsonError("AUTH_ERROR", message, status);
  }

  const baseSlug = sanitizeTenantSlug(tenantSlugInput || tenantName);
  if (!baseSlug) {
    return jsonError("VALIDATION_ERROR", "tenantSlug is invalid", 400);
  }

  let tenant:
    | {
        id: string;
        name: string;
        slug: string;
      }
    | null = null;

  let tenantErrorMessage: string | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
    const { data, error } = await admin
      .from("tenants")
      .insert({
        name: tenantName,
        slug,
        status: "active",
      })
      .select("id, name, slug")
      .single();

    if (!error && data) {
      tenant = data;
      break;
    }

    tenantErrorMessage = error?.message ?? "Unable to create tenant";
    if (error?.code !== "23505") {
      break;
    }
  }

  if (!tenant) {
    return jsonError("DB_ERROR", tenantErrorMessage ?? "Unable to create tenant", 500);
  }

  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .insert({
      tenant_id: tenant.id,
      user_id: authUser.user.id,
      role: "owner",
      is_active: true,
    })
    .select("role, is_active")
    .single();

  if (membershipError || !membership) {
    return jsonError("DB_ERROR", membershipError?.message ?? "Unable to create membership", 500);
  }

  return jsonOk(
    {
      user: {
        id: authUser.user.id,
        email: authUser.user.email ?? email,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      membership: {
        role: membership.role,
        isActive: membership.is_active,
      },
    },
    undefined,
    201,
  );
}
