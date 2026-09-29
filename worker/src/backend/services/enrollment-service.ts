import { addCalendarMonths, cyclePolicy } from "../domain/cycles";
import { RequestError } from "../errors";
import type { EnrollmentInput } from "../http/validation";
import { getDb } from "../persistence/db";
import { EventRepository } from "../persistence/repositories/event-repository";
import { enrollmentCodes } from "../persistence/schema";
import { randomToken, sha256 } from "../security/crypto";

export type EnrollmentCodeResult = {
  code: string;
  expires_at: string;
};

export type EnrollmentResult = {
  install_id: string;
  installation_token: string;
  shell_config: {
    worker_base_url: string;
    sidc_target: string;
    equipment_name: string;
    contact_name: string;
    ticket_url: string;
    protocol_version: 1;
  };
};

export class EnrollmentService {
  constructor(
    private readonly env: Env,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createCode(actor: string): Promise<EnrollmentCodeResult> {
    const id = crypto.randomUUID();
    const code = randomToken(12);
    const createdAt = this.now().toISOString();
    const expiresAt = new Date(
      this.now().getTime() + 30 * 60 * 1000,
    ).toISOString();
    await getDb(this.env)
      .insert(enrollmentCodes)
      .values({
        id,
        codeHash: await sha256(code),
        createdAt,
        expiresAt,
        createdBy: actor,
      })
      .run();
    await new EventRepository(this.env).insert({
      id: crypto.randomUUID(),
      serverReceivedAt: createdAt,
      type: "admin_enrollment_code_created",
      actor,
      payloadJson: JSON.stringify({
        enrollment_code_id: id,
        expires_at: expiresAt,
      }),
    });
    return { code, expires_at: expiresAt };
  }

  async enroll(
    code: string,
    input: EnrollmentInput,
    workerBaseUrl: string,
  ): Promise<EnrollmentResult> {
    const now = this.now().toISOString();
    const installationId = crypto.randomUUID();
    const attemptTag = `${now}#${installationId}`;
    const hashedCode = await sha256(code);
    const installationToken = randomToken(32);
    const durationMonths = cyclePolicy.chooseDurationMonths();
    const dueAt = addCalendarMonths(
      new Date(now),
      durationMonths,
    ).toISOString();
    const cycleId = crypto.randomUUID();
    const results = await this.env.DB.batch([
      this.env.DB.prepare(
        "UPDATE enrollment_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?",
      ).bind(attemptTag, hashedCode, now),
      this.env.DB.prepare(
        "INSERT INTO installations (id, token_hash, equipment_name, sidc_target, created_at, updated_at, shell_version, sidc_version, status) SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'active' WHERE EXISTS (SELECT 1 FROM enrollment_codes WHERE code_hash = ? AND used_at = ?)",
      ).bind(
        installationId,
        await sha256(installationToken),
        input.equipment_name,
        input.sidc_target,
        now,
        now,
        input.shell_version,
        input.sidc_version,
        hashedCode,
        attemptTag,
      ),
      this.env.DB.prepare(
        "INSERT INTO cycles (id, installation_id, started_at, duration_months, due_at, status, created_by, reason, updated_at) SELECT ?, ?, ?, ?, ?, 'active', ?, ?, ? WHERE EXISTS (SELECT 1 FROM enrollment_codes WHERE code_hash = ? AND used_at = ?)",
      ).bind(
        cycleId,
        installationId,
        now,
        durationMonths,
        dueAt,
        "enrollment",
        "initial cycle",
        now,
        hashedCode,
        attemptTag,
      ),
      this.env.DB.prepare(
        "INSERT INTO events (id, installation_id, cycle_id, server_received_at, type, actor, shell_version, sidc_version, equipment_name, payload_json) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM enrollment_codes WHERE code_hash = ? AND used_at = ?)",
      ).bind(
        crypto.randomUUID(),
        installationId,
        cycleId,
        now,
        "installation_enrolled",
        "enrollment",
        input.shell_version,
        input.sidc_version,
        input.equipment_name,
        JSON.stringify({}),
        hashedCode,
        attemptTag,
      ),
    ]);
    if (results[0]?.meta.changes !== 1) {
      throw new RequestError("enrollment_code_invalid_or_used", 409);
    }
    return {
      install_id: installationId,
      installation_token: installationToken,
      shell_config: {
        worker_base_url: workerBaseUrl,
        sidc_target: input.sidc_target,
        equipment_name: input.equipment_name,
        contact_name: this.env.CONTACT_NAME,
        ticket_url: this.env.TICKET_URL,
        protocol_version: 1,
      },
    };
  }
}
