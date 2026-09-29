import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { RequestError } from "../src/backend/errors";
import { EnrollmentService } from "../src/backend/services/enrollment-service";

describe("W-1 atomic enrollment", () => {
  it("fails and leaves zero ghost records when code is reused, expired, or non-existent", async () => {
    const service = new EnrollmentService(env);

    // 1. Create a valid code
    const { code } = await service.createCode("admin@test.com");

    const input = {
      protocol_version: 1 as const,
      shell_version: "1.0.0",
      sidc_version: "1.0.0",
      equipment_name: "PC-01",
      sidc_target: "C:\\SIDC\\app.exe",
    };

    // First enrollment succeeds
    const res1 = await service.enroll(code, input, "https://worker.test");
    expect(res1.install_id).toBeDefined();

    const countInstAfter1 = await env.DB.prepare(
      "SELECT count(*) as count FROM installations",
    ).first<{ count: number }>();
    const countCyclesAfter1 = await env.DB.prepare(
      "SELECT count(*) as count FROM cycles",
    ).first<{ count: number }>();
    const countEventsAfter1 = await env.DB.prepare(
      "SELECT count(*) as count FROM events WHERE type = 'installation_enrolled'",
    ).first<{ count: number }>();

    expect(countInstAfter1?.count).toBe(1);
    expect(countCyclesAfter1?.count).toBe(1);
    expect(countEventsAfter1?.count).toBe(1);

    // 2. Reused code -> should throw 409 and NOT insert any new installation/cycle/event
    await expect(
      service.enroll(code, input, "https://worker.test"),
    ).rejects.toThrow(RequestError);

    const countInstAfterReuse = await env.DB.prepare(
      "SELECT count(*) as count FROM installations",
    ).first<{ count: number }>();
    const countCyclesAfterReuse = await env.DB.prepare(
      "SELECT count(*) as count FROM cycles",
    ).first<{ count: number }>();
    const countEventsAfterReuse = await env.DB.prepare(
      "SELECT count(*) as count FROM events WHERE type = 'installation_enrolled'",
    ).first<{ count: number }>();

    expect(countInstAfterReuse?.count).toBe(1);
    expect(countCyclesAfterReuse?.count).toBe(1);
    expect(countEventsAfterReuse?.count).toBe(1);

    // 3. Non-existent code -> should throw 409 and NOT insert ghost records
    await expect(
      service.enroll("non-existent-code", input, "https://worker.test"),
    ).rejects.toThrow(RequestError);

    const countInstAfterInvalid = await env.DB.prepare(
      "SELECT count(*) as count FROM installations",
    ).first<{ count: number }>();
    expect(countInstAfterInvalid?.count).toBe(1);

    // 4. Expired code -> should throw 409 and NOT insert ghost records
    const expiredService = new EnrollmentService(
      env,
      () => new Date("2026-01-01T00:00:00Z"),
    );
    const { code: expCode } = await expiredService.createCode("admin@test.com");

    const futureService = new EnrollmentService(
      env,
      () => new Date("2026-01-02T00:00:00Z"),
    );
    await expect(
      futureService.enroll(expCode, input, "https://worker.test"),
    ).rejects.toThrow(RequestError);

    const countInstAfterExpired = await env.DB.prepare(
      "SELECT count(*) as count FROM installations",
    ).first<{ count: number }>();
    expect(countInstAfterExpired?.count).toBe(1);
  });

  it("handles concurrent requests with the same code: exactly one succeeds, other gets 409, zero ghost records", async () => {
    const service = new EnrollmentService(env);
    const { code } = await service.createCode("admin@test.com");

    const input1 = {
      protocol_version: 1 as const,
      shell_version: "1.0.0",
      sidc_version: "1.0.0",
      equipment_name: "PC-CONCURRENT-1",
      sidc_target: "C:\\SIDC\\app.exe",
    };

    const input2 = {
      protocol_version: 1 as const,
      shell_version: "1.0.0",
      sidc_version: "1.0.0",
      equipment_name: "PC-CONCURRENT-2",
      sidc_target: "C:\\SIDC\\app.exe",
    };

    // Run both simultaneously
    const results = await Promise.allSettled([
      service.enroll(code, input1, "https://worker.test"),
      service.enroll(code, input2, "https://worker.test"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason as RequestError;
    expect(error.status).toBe(409);
    expect(error.message).toBe("enrollment_code_invalid_or_used");

    // Verify exactly one installation created for this code
    const installations = await env.DB.prepare(
      "SELECT equipment_name FROM installations WHERE equipment_name LIKE 'PC-CONCURRENT%'",
    ).all<{ equipment_name: string }>();

    expect(installations.results).toHaveLength(1);

    // Verify cycles and events correspond to exactly that single installation
    const cycles = await env.DB.prepare(
      "SELECT count(*) as count FROM cycles WHERE installation_id NOT IN (SELECT id FROM installations)",
    ).first<{ count: number }>();
    expect(cycles?.count).toBe(0);

    const events = await env.DB.prepare(
      "SELECT count(*) as count FROM events WHERE installation_id NOT IN (SELECT id FROM installations)",
    ).first<{ count: number }>();
    expect(events?.count).toBe(0);
  });
});
