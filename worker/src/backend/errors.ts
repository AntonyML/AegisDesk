import type { Hono } from "hono";
import { jsonError } from "./security/crypto";

export class RequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}

export class AuthError extends RequestError {
  constructor(code: string, status: 401 | 403) {
    super(code, status);
  }
}

export function registerErrorHandler(app: Hono<{ Bindings: Env }>): void {
  app.onError((error, c) => {
    if (error instanceof AuthError || error instanceof RequestError) {
      return jsonError(error.code, error.status);
    }
    console.error(
      JSON.stringify({
        event: "request_error",
        path: new URL(c.req.url).pathname,
      }),
    );
    return jsonError("internal_error", 500);
  });
}
