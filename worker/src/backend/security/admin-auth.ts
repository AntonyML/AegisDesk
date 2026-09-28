import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import { AuthError } from "../errors";

export { AuthError } from "../errors";

export async function requireAdmin(
  request: Request,
  env: Env,
): Promise<string> {
  if (
    String(env.ENVIRONMENT) === "test" &&
    request.headers.get("x-aegis-test-admin") === "1"
  ) {
    return "test-admin";
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

  const email = typeof payload.email === "string" ? payload.email : null;
  if (!email) throw new AuthError("admin_identity_missing", 403);
  return email;
}
