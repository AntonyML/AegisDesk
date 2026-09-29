import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../src";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    ENVIRONMENT: "test",
    APP_URL: "https://aegisdesk.test",
    PLATFORM_OWNER_EMAILS: "owner@aegisdesk.test",
    TICKET_RATE_LIMIT: undefined, // test D1 fallback counter
    ...overrides,
  } as unknown as Env;
}

describe("W-7 CSRF and abuse prevention", () => {
  it("protects admin mutating endpoints with strict CSRF check and Content-Type requirement", async () => {
    const workerEnv = makeEnv();
    const adminHeaders = {
      "x-aegis-test-admin": "1",
      "x-aegis-test-email": "owner@aegisdesk.test",
    };

    // 1. Missing Origin and Referer -> 403
    const noOriginRes = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/admin/enrollment-codes", {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
        },
      }),
      workerEnv,
    );
    expect(noOriginRes.status).toBe(403);
    const noOriginJson = (await noOriginRes.json()) as any;
    expect(noOriginJson.error).toBe("csrf_protection_failed");

    // 2. Cross-origin / malicious Origin -> 403
    const evilOriginRes = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/admin/enrollment-codes", {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
          origin: "https://evil-attacker.com",
        },
      }),
      workerEnv,
    );
    expect(evilOriginRes.status).toBe(403);

    // 3. Invalid Content-Type (e.g. text/plain) -> 400
    const invalidContentTypeRes = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/admin/enrollment-codes", {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "text/plain",
          origin: "https://aegisdesk.test",
        },
        body: "{}",
      }),
      workerEnv,
    );
    expect(invalidContentTypeRes.status).toBe(400);
    const invalidTypeJson = (await invalidContentTypeRes.json()) as any;
    expect(invalidTypeJson.error).toBe("invalid_content_type");

    // 4. Valid Origin and Content-Type -> 201
    const validOriginRes = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/admin/enrollment-codes", {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
          origin: "https://aegisdesk.test",
        },
      }),
      workerEnv,
    );
    expect(validOriginRes.status).toBe(201);

    // 5. Valid Referer without Origin -> 201
    const validRefererRes = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/admin/enrollment-codes", {
        method: "POST",
        headers: {
          ...adminHeaders,
          "content-type": "application/json",
          referer: "https://aegisdesk.test/panel/dashboard",
        },
      }),
      workerEnv,
    );
    expect(validRefererRes.status).toBe(201);

    // 6. Admin GET requests are NOT blocked by CSRF check
    const getRes = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/admin/installations", {
        method: "GET",
        headers: adminHeaders,
      }),
      workerEnv,
    );
    expect(getRes.status).toBe(200);
  });

  it("enforces D1-backed rate limiting on public tickets endpoint", async () => {
    const workerEnv = makeEnv();
    const testIp = "198.51.100.42";

    // Clear rate limits for testIp
    await workerEnv.DB.prepare("DELETE FROM rate_limits WHERE key = ?")
      .bind(`ticket:${testIp}`)
      .run();

    // Send 10 requests (limit is 10)
    for (let i = 1; i <= 10; i++) {
      const res = await app.fetch(
        new Request("https://aegisdesk.test/api/v1/tickets", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": testIp,
          },
          body: JSON.stringify({
            name: `User ${i}`,
            team: "Team",
            category: "sidc",
            issue_code: "no_abre",
            turnstile_token: "test-token",
            idempotency_key: `70000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
          }),
        }),
        workerEnv,
      );
      expect(res.status).toBe(202);
    }

    // 11th request -> 429
    const blockedRes = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/tickets", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": testIp,
        },
        body: JSON.stringify({
          name: "User 11",
          team: "Team",
          category: "sidc",
          issue_code: "no_abre",
          turnstile_token: "test-token",
          idempotency_key: "70000000-0000-4000-8000-000000000011",
        }),
      }),
      workerEnv,
    );
    expect(blockedRes.status).toBe(429);
    const body = (await blockedRes.json()) as any;
    expect(body.error).toBe("rate_limited");
  });

  it("enforces D1-backed rate limiting on shell enroll endpoint", async () => {
    const workerEnv = makeEnv();
    const testIp = "198.51.100.88";

    // Clear rate limits for testIp
    await workerEnv.DB.prepare("DELETE FROM rate_limits WHERE key = ?")
      .bind(`enroll:${testIp}`)
      .run();

    // Send 10 requests (limit is 10). Missing code returns 401, but passes rate limit
    for (let i = 1; i <= 10; i++) {
      const res = await app.fetch(
        new Request("https://aegisdesk.test/api/v1/shell/enroll", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": testIp,
          },
          body: JSON.stringify({
            protocol_version: 1,
            shell_version: "1.0.0",
            sidc_version: "1.0.0",
            equipment_name: "PC",
            sidc_target: "C:\\app.exe",
          }),
        }),
        workerEnv,
      );
      // Since code is missing, it returns 401 enrollment_required (not 429)
      expect(res.status).toBe(401);
    }

    // 11th request -> 429 rate_limited
    const blockedRes = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/shell/enroll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": testIp,
        },
        body: JSON.stringify({
          protocol_version: 1,
          shell_version: "1.0.0",
          sidc_version: "1.0.0",
          equipment_name: "PC",
          sidc_target: "C:\\app.exe",
        }),
      }),
      workerEnv,
    );
    expect(blockedRes.status).toBe(429);
    const body = (await blockedRes.json()) as any;
    expect(body.error).toBe("rate_limited");
  });
});
