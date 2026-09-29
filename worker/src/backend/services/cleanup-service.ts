import { RETENTION_CONFIG, TELEMETRY_EVENT_TYPES } from "../config/retention";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CleanupReport {
  telemetryEventsDeleted: number;
  auditEventsDeleted: number;
  eventsDeleted: number;
  codesDeleted: number;
  ticketsDeleted: number;
  installationsAnonymized: number;
  rateLimitsDeleted: number;
}

export class CleanupService {
  constructor(private readonly env: Env) {}

  async pruneEvents(now: Date = new Date()): Promise<void> {
    const telemetryCutoff = new Date(
      now.getTime() - RETENTION_CONFIG.TELEMETRY_EVENTS_DAYS * DAY_MS,
    ).toISOString();
    const auditCutoff = new Date(
      now.getTime() - RETENTION_CONFIG.ADMIN_AUDIT_EVENTS_DAYS * DAY_MS,
    ).toISOString();
    const placeholders = TELEMETRY_EVENT_TYPES.map(() => "?").join(",");

    await this.env.DB.batch([
      this.env.DB.prepare(
        `DELETE FROM events WHERE server_received_at < ? AND type IN (${placeholders})`,
      ).bind(telemetryCutoff, ...TELEMETRY_EVENT_TYPES),
      this.env.DB.prepare(
        "DELETE FROM events WHERE server_received_at < ?",
      ).bind(auditCutoff),
    ]);
  }

  async runRetentionCleanup(now: Date = new Date()): Promise<CleanupReport> {
    const telemetryCutoff = new Date(
      now.getTime() - RETENTION_CONFIG.TELEMETRY_EVENTS_DAYS * DAY_MS,
    ).toISOString();
    const auditCutoff = new Date(
      now.getTime() - RETENTION_CONFIG.ADMIN_AUDIT_EVENTS_DAYS * DAY_MS,
    ).toISOString();
    const codeCutoff = new Date(
      now.getTime() -
        RETENTION_CONFIG.ENROLLMENT_CODES_EXPIRATION_DAYS * DAY_MS,
    ).toISOString();
    const ticketCutoff = new Date(
      now.getTime() - RETENTION_CONFIG.RESOLVED_TICKETS_DAYS * DAY_MS,
    ).toISOString();
    const instCutoff = new Date(
      now.getTime() - RETENTION_CONFIG.REVOKED_INSTALLATIONS_DAYS * DAY_MS,
    ).toISOString();
    const rateLimitCutoff =
      Math.floor(now.getTime() / 1000) -
      RETENTION_CONFIG.RATE_LIMITS_CLEANUP_DAYS * 86400;

    const telemetryPlaceholders = TELEMETRY_EVENT_TYPES.map(() => "?").join(
      ",",
    );

    // 1. Telemetry events purge (365d)
    const telemetryRes = await this.env.DB.prepare(
      `DELETE FROM events WHERE server_received_at < ? AND type IN (${telemetryPlaceholders})`,
    )
      .bind(telemetryCutoff, ...TELEMETRY_EVENT_TYPES)
      .run();

    // 2. Administrative audit events purge (730d)
    const auditRes = await this.env.DB.prepare(
      "DELETE FROM events WHERE server_received_at < ?",
    )
      .bind(auditCutoff)
      .run();

    // 3. Expired enrollment codes (+7d)
    const codesRes = await this.env.DB.prepare(
      "DELETE FROM enrollment_codes WHERE expires_at < ?",
    )
      .bind(codeCutoff)
      .run();

    // 4. Resolved tickets (12m after resolution)
    const ticketsRes = await this.env.DB.prepare(
      "DELETE FROM tickets WHERE status = 'resolved' AND ((resolved_at IS NOT NULL AND resolved_at < ?) OR (resolved_at IS NULL AND created_at < ?))",
    )
      .bind(ticketCutoff, ticketCutoff)
      .run();

    // 5. Revoked installations: ANONYMIZE at 12m (do NOT delete, preserve terms_acceptances)
    const nowIso = now.toISOString();
    const anonInstRes = await this.env.DB.prepare(
      "UPDATE installations SET equipment_name = '[Anonimizado]', sidc_target = '[Anonimizado]', assigned_user_id = NULL, updated_at = ? WHERE status = 'revoked' AND equipment_name != '[Anonimizado]' AND ((revoked_at IS NOT NULL AND revoked_at < ?) OR (revoked_at IS NULL AND updated_at < ?))",
    )
      .bind(nowIso, instCutoff, instCutoff)
      .run();

    // 6. Rate limits (>1d)
    const rateLimitsRes = await this.env.DB.prepare(
      "DELETE FROM rate_limits WHERE reset_at < ?",
    )
      .bind(rateLimitCutoff)
      .run();

    const telemetryDeleted = telemetryRes.meta.changes ?? 0;
    const auditDeleted = auditRes.meta.changes ?? 0;

    return {
      telemetryEventsDeleted: telemetryDeleted,
      auditEventsDeleted: auditDeleted,
      eventsDeleted: telemetryDeleted + auditDeleted,
      codesDeleted: codesRes.meta.changes ?? 0,
      ticketsDeleted: ticketsRes.meta.changes ?? 0,
      installationsAnonymized: anonInstRes.meta.changes ?? 0,
      rateLimitsDeleted: rateLimitsRes.meta.changes ?? 0,
    };
  }
}
