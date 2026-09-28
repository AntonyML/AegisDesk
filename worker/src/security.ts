import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";

const encoder = new TextEncoder();

export function randomToken(bytes = 24): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return toBase64Url(data);
}

function toBase64Url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64Url(new Uint8Array(digest));
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ", 2);
  return scheme?.toLowerCase() === "bearer" && value ? value : null;
}

export function enrollmentCode(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ", 2);
  return scheme?.toLowerCase() === "enrollment" && value ? value : null;
}

export function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

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

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 401 | 403,
  ) {
    super(code);
  }
}

export function jsonError(code: string, status: number): Response {
  return Response.json({ error: code }, { status });
}
