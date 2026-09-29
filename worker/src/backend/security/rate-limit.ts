import { RequestError } from "../errors";

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

export async function checkRateLimit(
  env: Env,
  key: string,
  options: RateLimitOptions = { limit: 10, windowSeconds: 60 },
): Promise<void> {
  if (env.TICKET_RATE_LIMIT) {
    const result = await env.TICKET_RATE_LIMIT.limit({ key });
    if (!result.success) throw new RequestError("rate_limited", 429);
    return;
  }

  // D1-backed counter
  const now = Math.floor(Date.now() / 1000);
  const resetAt = now + options.windowSeconds;

  const row = await env.DB.prepare(
    "SELECT count, reset_at FROM rate_limits WHERE key = ?",
  )
    .bind(key)
    .first<{ count: number; reset_at: number }>();

  if (!row || row.reset_at <= now) {
    await env.DB.prepare(
      "INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = ?",
    )
      .bind(key, resetAt, resetAt)
      .run();
    return;
  }

  if (row.count >= options.limit) {
    throw new RequestError("rate_limited", 429);
  }

  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?")
    .bind(key)
    .run();
}
