import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../src";
import { CleanupService } from "../src/backend/services/cleanup-service";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    ENVIRONMENT: "test",
    APP_URL: "https://aegisdesk.test",
    PLATFORM_OWNER_EMAILS: "owner@aegisdesk.test",
    ...overrides,
  } as unknown as Env;
}

describe("W-8 retention policy and titular privacy rights", () => {
  it("enforces automated data retention cleanup across events, codes, tickets, and installations", async () => {
    const workerEnv = makeEnv();
    const cleanup = new CleanupService(workerEnv);
    const now = new Date();

    const date800d = new Date(
      now.getTime() - 800 * 24 * 60 * 60 * 1000,
    ).toISOString(); // 800 days ago (> 730d)
    const date400d = new Date(
      now.getTime() - 400 * 24 * 60 * 60 * 1000,
    ).toISOString(); // 400 days ago (> 365d, < 730d)
    const date10d = new Date(
      now.getTime() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString(); // 10 days ago
    const expiredCodeDate = new Date(
      now.getTime() - 15 * 24 * 60 * 60 * 1000,
    ).toISOString(); // 15 days expired

    // 1. Seed events:
    // - Telemetry event at 400d (>365d) -> should be deleted
    // - Audit event at 400d (<730d) -> should be KEPT
    // - Audit event at 800d (>730d) -> should be deleted
    // - Telemetry event at 10d -> should be KEPT
    await workerEnv.DB.batch([
      workerEnv.DB.prepare(
        "INSERT INTO events (id, type, actor, server_received_at, payload_json) VALUES ('ev-telemetry-old', 'launch_result', 'actor', ?, '{}')",
      ).bind(date400d),
      workerEnv.DB.prepare(
        "INSERT INTO events (id, type, actor, server_received_at, payload_json) VALUES ('ev-opening-old', 'opening', 'actor', ?, '{}')",
      ).bind(date400d),
      workerEnv.DB.prepare(
        "INSERT INTO events (id, type, actor, server_received_at, payload_json) VALUES ('ev-notice-old', 'notice:final_14_days', 'actor', ?, '{}')",
      ).bind(date400d),
      workerEnv.DB.prepare(
        "INSERT INTO events (id, type, actor, server_received_at, payload_json) VALUES ('ev-audit-mid', 'admin_ticket_updated', 'admin', ?, '{}')",
      ).bind(date400d),
      workerEnv.DB.prepare(
        "INSERT INTO events (id, type, actor, server_received_at, payload_json) VALUES ('ev-audit-old', 'admin_ticket_updated', 'admin', ?, '{}')",
      ).bind(date800d),
      workerEnv.DB.prepare(
        "INSERT INTO events (id, type, actor, server_received_at, payload_json) VALUES ('ev-telemetry-recent', 'launch_result', 'actor', ?, '{}')",
      ).bind(date10d),
    ]);

    // 2. Seed enrollment codes (expired long ago vs recent)
    await workerEnv.DB.batch([
      workerEnv.DB.prepare(
        "INSERT INTO enrollment_codes (id, code_hash, created_at, expires_at, created_by) VALUES ('code-old', 'hash1', ?, ?, 'admin')",
      ).bind(date400d, expiredCodeDate),
      workerEnv.DB.prepare(
        "INSERT INTO enrollment_codes (id, code_hash, created_at, expires_at, created_by) VALUES ('code-recent', 'hash2', ?, ?, 'admin')",
      ).bind(date10d, new Date(now.getTime() + 100000).toISOString()),
    ]);

    // 3. Seed tickets (resolved old vs open old vs resolved recent)
    await workerEnv.DB.batch([
      workerEnv.DB.prepare(
        "INSERT INTO tickets (id, name, team, description, status, notified, created_at, resolved_at) VALUES ('t-old-resolved', 'User', 'Team', 'Desc', 'resolved', 1, ?, ?)",
      ).bind(date800d, date400d),
      workerEnv.DB.prepare(
        "INSERT INTO tickets (id, name, team, description, status, notified, created_at) VALUES ('t-old-open', 'User', 'Team', 'Desc', 'open', 1, ?)",
      ).bind(date400d),
      workerEnv.DB.prepare(
        "INSERT INTO tickets (id, name, team, description, status, notified, created_at, resolved_at) VALUES ('t-recent-resolved', 'User', 'Team', 'Desc', 'resolved', 1, ?, ?)",
      ).bind(date10d, date10d),
    ]);

    // 4. Seed revoked installation and child cycle/terms acceptance
    const instId = "80000000-0000-4000-8000-000000000001";
    await workerEnv.DB.batch([
      workerEnv.DB.prepare(
        "INSERT INTO installations (id, token_hash, equipment_name, sidc_target, status, created_at, updated_at, revoked_at, shell_version, sidc_version) VALUES (?, 'hash', 'PC-Revoked', 'C:\\app.exe', 'revoked', ?, ?, ?, '1.0', '1.0')",
      ).bind(instId, date800d, date400d, date400d),
      workerEnv.DB.prepare(
        "INSERT INTO cycles (id, installation_id, started_at, duration_months, due_at, status, created_by, reason, updated_at) VALUES ('cycle-revoked', ?, ?, 3, ?, 'closed', 'system', 'test', ?)",
      ).bind(instId, date800d, date800d, date800d),
      workerEnv.DB.prepare(
        "INSERT INTO terms_acceptances (id, installation_id, terms_version, terms_sha256, accepted_at_client, received_at, method, shell_version) VALUES ('terms-revoked', ?, '0.1.0', 'sha', ?, ?, 'installer', '1.0.0')",
      ).bind(instId, date800d, date800d),
    ]);

    // Run cleanup
    const report = await cleanup.runRetentionCleanup(now);
    expect(report.eventsDeleted).toBeGreaterThanOrEqual(2);
    expect(report.telemetryEventsDeleted).toBeGreaterThanOrEqual(1);
    expect(report.auditEventsDeleted).toBeGreaterThanOrEqual(1);
    expect(report.codesDeleted).toBeGreaterThanOrEqual(1);
    expect(report.ticketsDeleted).toBeGreaterThanOrEqual(1);
    expect(report.installationsAnonymized).toBeGreaterThanOrEqual(1);

    // Assert database state
    // Old telemetry event purged
    const evTeleOld = await workerEnv.DB.prepare(
      "SELECT id FROM events WHERE id = 'ev-telemetry-old'",
    ).first();
    expect(evTeleOld).toBeNull();

    const evOpeningOld = await workerEnv.DB.prepare(
      "SELECT id FROM events WHERE id = 'ev-opening-old'",
    ).first();
    const evNoticeOld = await workerEnv.DB.prepare(
      "SELECT id FROM events WHERE id = 'ev-notice-old'",
    ).first();
    expect(evOpeningOld).toBeNull();
    expect(evNoticeOld).toBeNull();

    // Mid audit event (400d < 730d) KEPT
    const evAuditMid = await workerEnv.DB.prepare(
      "SELECT id FROM events WHERE id = 'ev-audit-mid'",
    ).first();
    expect(evAuditMid).not.toBeNull();

    // Old audit event (800d > 730d) purged
    const evAuditOld = await workerEnv.DB.prepare(
      "SELECT id FROM events WHERE id = 'ev-audit-old'",
    ).first();
    expect(evAuditOld).toBeNull();

    // Recent telemetry event KEPT
    const evTeleRecent = await workerEnv.DB.prepare(
      "SELECT id FROM events WHERE id = 'ev-telemetry-recent'",
    ).first();
    expect(evTeleRecent).not.toBeNull();

    // Expired code purged, recent kept
    const codeOld = await workerEnv.DB.prepare(
      "SELECT id FROM enrollment_codes WHERE id = 'code-old'",
    ).first();
    const codeRecent = await workerEnv.DB.prepare(
      "SELECT id FROM enrollment_codes WHERE id = 'code-recent'",
    ).first();
    expect(codeOld).toBeNull();
    expect(codeRecent).not.toBeNull();

    // Old resolved ticket purged, old open ticket kept
    const tOldResolved = await workerEnv.DB.prepare(
      "SELECT id FROM tickets WHERE id = 't-old-resolved'",
    ).first();
    const tOldOpen = await workerEnv.DB.prepare(
      "SELECT id FROM tickets WHERE id = 't-old-open'",
    ).first();
    expect(tOldResolved).toBeNull();
    expect(tOldOpen).not.toBeNull();

    // Revoked installation ANONYMIZED (not deleted); terms and cycle PRESERVED
    const inst = await workerEnv.DB.prepare(
      "SELECT * FROM installations WHERE id = ?",
    )
      .bind(instId)
      .first<any>();
    expect(inst).not.toBeNull();
    expect(inst.equipment_name).toBe("[Anonimizado]");
    expect(inst.sidc_target).toBe("[Anonimizado]");
    expect(inst.assigned_user_id).toBeNull();

    const cycle = await workerEnv.DB.prepare(
      "SELECT id FROM cycles WHERE id = 'cycle-revoked'",
    ).first();
    const terms = await workerEnv.DB.prepare(
      "SELECT id FROM terms_acceptances WHERE id = 'terms-revoked'",
    ).first();
    expect(cycle).not.toBeNull();
    expect(terms).not.toBeNull();
  });

  it("exports titular data completely and allows erasure only to platform_owner", async () => {
    const workerEnv = makeEnv();
    const now = new Date().toISOString();
    const userId = "80000000-0000-4000-8000-000000000002";
    const instId = "80000000-0000-4000-8000-000000000003";
    const userEmail = "titular@empresa.com";
    const userName = "Juan Titular";

    // Seed organization, user, installation, terms acceptance and ticket
    await workerEnv.DB.batch([
      workerEnv.DB.prepare(
        "INSERT INTO organizations (id, name, status, created_at, updated_at) VALUES ('org-privacy', 'Privacy Org', 'active', ?, ?)",
      ).bind(now, now),
      workerEnv.DB.prepare(
        "INSERT INTO managed_users (id, organization_id, display_name, email, status, created_at, updated_at) VALUES (?, 'org-privacy', ?, ?, 'active', ?, ?)",
      ).bind(userId, userName, userEmail, now, now),
      workerEnv.DB.prepare(
        "INSERT INTO installations (id, token_hash, equipment_name, sidc_target, organization_id, assigned_user_id, status, created_at, updated_at, shell_version, sidc_version) VALUES (?, 'hash-titular', 'PC-Titular', 'C:\\app.exe', 'org-privacy', ?, 'active', ?, ?, '1.0', '1.0')",
      ).bind(instId, userId, now, now),
      workerEnv.DB.prepare(
        "INSERT INTO terms_acceptances (id, installation_id, terms_version, terms_sha256, accepted_at_client, received_at, method, shell_version) VALUES ('terms-titular', ?, '0.1.0', '9dc95681c0fa738e52f87c57e025b5bf8bdbbae0a1ebb1a805b85726e35851b6', ?, ?, 'installer', '1.0.0')",
      ).bind(instId, now, now),
      workerEnv.DB.prepare(
        "INSERT INTO tickets (id, name, team, description, status, notified, organization_id, created_at) VALUES ('ticket-titular', ?, 'Sistemas', 'Problema con la VPN', 'open', 0, 'org-privacy', ?)",
      ).bind(userName, now),
    ]);

    const ownerHeaders = {
      "x-aegis-test-admin": "1",
      "x-aegis-test-email": "owner@aegisdesk.test",
      "content-type": "application/json",
      origin: "https://aegisdesk.test",
    };

    // 1. Export as platform_owner
    const exportRes = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/admin/privacy/export", {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({ email: userEmail }),
      }),
      workerEnv,
    );
    expect(exportRes.status).toBe(200);
    const exportData = (await exportRes.json()) as any;
    expect(exportData.user).toBeDefined();
    expect(exportData.user.email).toBe(userEmail);
    expect(exportData.installations.length).toBe(1);
    expect(exportData.terms_acceptances.length).toBe(1);
    expect(exportData.tickets.length).toBe(1);

    // 2. Erase as platform_owner with mode: "delete"
    const eraseRes = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/admin/privacy/erase", {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          email: userEmail,
          mode: "delete",
          reason: "Solicitud formal de supresión de datos personales",
        }),
      }),
      workerEnv,
    );
    expect(eraseRes.status).toBe(200);
    const eraseData = (await eraseRes.json()) as any;
    expect(eraseData.erased).toBe(true);
    expect(eraseData.user_erased).toBe(true);

    // Verify user is anonymized and disabled
    const userAfter = await workerEnv.DB.prepare(
      "SELECT * FROM managed_users WHERE id = ?",
    )
      .bind(userId)
      .first<any>();
    expect(userAfter.display_name).toBe("[Anonimizado]");
    expect(userAfter.email).toContain("@deleted.local");
    expect(userAfter.status).toBe("disabled");

    // Verify installation was anonymized and unlinked
    const instAfter = await workerEnv.DB.prepare(
      "SELECT * FROM installations WHERE id = ?",
    )
      .bind(instId)
      .first<any>();
    expect(instAfter.equipment_name).toBe("[Anonimizado]");
    expect(instAfter.assigned_user_id).toBeNull();

    // Verify terms acceptance was PRESERVED
    const termsAfter = await workerEnv.DB.prepare(
      "SELECT * FROM terms_acceptances WHERE installation_id = ?",
    )
      .bind(instId)
      .first<any>();
    expect(termsAfter).not.toBeNull();

    // Verify ticket was anonymized
    const ticketAfter = await workerEnv.DB.prepare(
      "SELECT * FROM tickets WHERE id = 'ticket-titular'",
    ).first<any>();
    expect(ticketAfter.name).toBe("[Anonimizado]");
    expect(ticketAfter.description).toBe(
      "[Anonimizado por ejercicio de derechos del titular]",
    );

    // Verify audit event was logged without subject identifiers
    const auditEvent = await workerEnv.DB.prepare(
      "SELECT * FROM events WHERE type = 'privacy_erasure_performed'",
    ).first<any>();
    expect(auditEvent).toBeDefined();
    expect(auditEvent.actor).toBe("owner@aegisdesk.test");

    const payload = JSON.parse(auditEvent.payload_json);
    expect(payload.reason).toBe(
      "Solicitud formal de supresión de datos personales",
    );
    expect(payload.mode).toBe("delete");
    expect(payload.subject_type).toBe("email");
    expect(payload.user_erased).toBe(true);
    expect(payload.installations_anonymized).toBe(1);
    expect(payload.tickets_erased).toBe(1);

    // MUST NOT leak subject identifiers
    expect(payload.email).toBeUndefined();
    expect(payload.user_id).toBeUndefined();
    expect(payload.userId).toBeUndefined();
    expect(payload.installation_id).toBeUndefined();
    expect(payload.target).toBeUndefined();
    expect(auditEvent.payload_json).not.toContain(userEmail);
    expect(auditEvent.payload_json).not.toContain(userName);
    expect(auditEvent.payload_json).not.toContain(userId);
    expect(auditEvent.payload_json).not.toContain(instId);
  });

  it("handles erasure of non-existent subject gracefully without errors or leakage", async () => {
    const workerEnv = makeEnv();
    const ownerHeaders = {
      "x-aegis-test-admin": "1",
      "x-aegis-test-email": "owner@aegisdesk.test",
      "content-type": "application/json",
      origin: "https://aegisdesk.test",
    };

    const eraseRes = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/admin/privacy/erase", {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({
          email: "nonexistent@company.test",
          mode: "erase",
          reason: "Derecho al olvido",
        }),
      }),
      workerEnv,
    );

    expect(eraseRes.status).toBe(200);
    const eraseData = (await eraseRes.json()) as any;
    expect(eraseData.erased).toBe(true);
    expect(eraseData.user_erased).toBe(false);
    expect(eraseData.installations_anonymized).toBe(0);
    expect(eraseData.tickets_erased).toBe(0);
  });
});
