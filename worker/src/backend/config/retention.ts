/**
 * AegisDesk Data Retention Configuration (Policy C6)
 *
 * Provisional operational defaults, not legal retention periods.
 * These are source constants, not production settings adjustable by a tenant.
 */
export const RETENTION_CONFIG = {
  /**
   * Telemetry events retention in days (365 days).
   * Applies to device telemetry, launch events, open events, and enrollment events.
   */
  TELEMETRY_EVENTS_DAYS: 365,

  /**
   * Administrative audit events retention in days (730 days).
   * Applies to administrative actions and governance events (proposed policy).
   */
  ADMIN_AUDIT_EVENTS_DAYS: 730,

  /**
   * Resolved tickets retention in days (12 months / 365 days after resolution).
   * Deletion is accepted.
   */
  RESOLVED_TICKETS_DAYS: 365,

  /**
   * Expired or consumed enrollment codes retention in days (+7 days after expiration).
   */
  ENROLLMENT_CODES_EXPIRATION_DAYS: 7,

  /**
   * Revoked installations retention in days (12 months / 365 days).
   * At 12 months, revoked installations are ANONYMIZED (not deleted).
   */
  REVOKED_INSTALLATIONS_DAYS: 365,

  /**
   * Provisional proposal only. CleanupService currently does not consume this
   * value and does not purge terms_acceptances.
   */
  TERMS_ACCEPTANCE_RETENTION_DAYS: 1825,

  /**
   * Rate limits table retention in days (1 day).
   * Expired counter rows older than 1 day are cleaned up.
   */
  RATE_LIMITS_CLEANUP_DAYS: 1,
} as const;

export const TELEMETRY_EVENT_TYPES = [
  "opening",
  "notice:final_14_days",
  "notice:final_7_days",
  "notice:expired",
  "launch_result",
  "consent_required",
  "countdown_completed",
  "consent_accepted",
  "consent_declined",
  "installation_enrolled",
  "heartbeat",
] as const;
