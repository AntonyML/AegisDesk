import { eq } from "drizzle-orm";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import { AuthError } from "../errors";
import { getDb } from "../persistence/db";
import { adminMemberships } from "../persistence/schema";

export { AuthError } from "../errors";

export type AdminRole = "platform_owner" | "org_admin" | "org_viewer";

export interface AdminSession {
  email: string;
  role: AdminRole;
  organizationId: string | null;
  actor: string;
}

export const ROLE_RANK: Record<AdminRole, number> = {
  platform_owner: 3,
  org_admin: 2,
  org_viewer: 1,
};

export async function resolveAdminSession(
  email: string,
  env: Env,
  minRole?: AdminRole,
): Promise<AdminSession> {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check PLATFORM_OWNER_EMAILS
  const ownerEnv =
    env.PLATFORM_OWNER_EMAILS !== undefined
      ? env.PLATFORM_OWNER_EMAILS
      : (env.ENVIRONMENT as unknown as string) === "test"
        ? "test-admin@test.com"
        : "";
  const ownerEmails = ownerEnv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (ownerEmails.includes(normalizedEmail)) {
    // Seed/ensure platform_owner membership exists
    const existing = await getDb(env)
      .select()
      .from(adminMemberships)
      .where(eq(adminMemberships.email, normalizedEmail))
      .all();
    const hasPlatform = existing.some(
      (m) => m.role === "platform_owner" && m.organizationId === null,
    );
    if (!hasPlatform) {
      await getDb(env)
        .insert(adminMemberships)
        .values({
          id: crypto.randomUUID(),
          email: normalizedEmail,
          organizationId: null,
          role: "platform_owner",
          createdAt: new Date().toISOString(),
          createdBy: "system",
        })
        .run();
    }
    const session: AdminSession = {
      email: normalizedEmail,
      role: "platform_owner",
      organizationId: null,
      actor: normalizedEmail,
    };
    if (minRole && ROLE_RANK[session.role] < ROLE_RANK[minRole]) {
      throw new AuthError("admin_forbidden", 403);
    }
    return session;
  }

  // 2. Query memberships for this email
  const memberships = await getDb(env)
    .select()
    .from(adminMemberships)
    .where(eq(adminMemberships.email, normalizedEmail))
    .all();

  if (memberships.length === 0) {
    throw new AuthError("admin_access_denied", 403);
  }

  // Pick highest role membership
  const primary = [...memberships].sort(
    (a, b) => ROLE_RANK[b.role as AdminRole] - ROLE_RANK[a.role as AdminRole],
  )[0];

  const session: AdminSession = {
    email: normalizedEmail,
    role: primary.role as AdminRole,
    organizationId: primary.organizationId,
    actor: normalizedEmail,
  };

  if (minRole && ROLE_RANK[session.role] < ROLE_RANK[minRole]) {
    throw new AuthError("admin_forbidden", 403);
  }

  return session;
}

export async function requireAdmin(
  request: Request,
  env: Env,
  minRole?: AdminRole,
): Promise<AdminSession> {
  const isExplicitTestEnv = (env.ENVIRONMENT as unknown as string) === "test";
  if (isExplicitTestEnv && request.headers.get("x-aegis-test-admin") === "1") {
    const email =
      request.headers.get("x-aegis-test-email") || "test-admin@test.com";
    return resolveAdminSession(email, env, minRole);
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUDIENCE) {
    throw new AuthError("admin_auth_required", 401);
  }

  const issuer = env.ACCESS_TEAM_DOMAIN.replace(/\/$/, "");
  const keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer,
      audience: env.ACCESS_AUDIENCE,
    }));
  } catch {
    throw new AuthError("admin_auth_invalid", 401);
  }

  const payloadEmail = typeof payload.email === "string" ? payload.email : null;
  if (!payloadEmail) throw new AuthError("admin_identity_missing", 403);

  return resolveAdminSession(payloadEmail, env, minRole);
}
