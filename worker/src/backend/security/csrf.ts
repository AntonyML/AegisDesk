import type { Context, Next } from "hono";
import { RequestError } from "../errors";

export async function adminCsrfProtection(
  c: Context<{ Bindings: Env }>,
  next: Next,
): Promise<void> {
  const method = c.req.method.toUpperCase();
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    // 1. Content-Type must be application/json
    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new RequestError("invalid_content_type", 400);
    }

    // 2. Origin or Referer must match Worker host
    const origin = c.req.header("origin");
    const referer = c.req.header("referer");
    const targetUrl = new URL(c.req.url);
    const targetHost = targetUrl.host;

    let sourceHost: string | null = null;
    if (origin) {
      try {
        sourceHost = new URL(origin).host;
      } catch {
        throw new RequestError("csrf_protection_failed", 403);
      }
    } else if (referer) {
      try {
        sourceHost = new URL(referer).host;
      } catch {
        throw new RequestError("csrf_protection_failed", 403);
      }
    }

    if (!sourceHost || sourceHost !== targetHost) {
      throw new RequestError("csrf_protection_failed", 403);
    }
  }

  await next();
}
