import type { PrivacyEraseInput, PrivacyExportInput } from "../http/validation";

export interface TitularExportResult {
  user: any | null;
  installations: any[];
  terms_acceptances: any[];
  tickets: any[];
  events: any[];
}

export interface TitularEraseResult {
  erased: boolean;
  user_erased: boolean;
  installations_anonymized: number;
  tickets_erased: number;
}

export class PrivacyService {
  constructor(private readonly env: Env) {}

  async exportData(input: PrivacyExportInput): Promise<TitularExportResult> {
    let user: any = null;

    if (input.managed_user_id) {
      user = await this.env.DB.prepare(
        "SELECT id, organization_id, group_id, display_name, email, status, created_at, updated_at FROM managed_users WHERE id = ?",
      )
        .bind(input.managed_user_id)
        .first();
    } else if (input.email) {
      user = await this.env.DB.prepare(
        "SELECT id, organization_id, group_id, display_name, email, status, created_at, updated_at FROM managed_users WHERE email = ?",
      )
        .bind(input.email)
        .first();
    }

    // Installations assigned to user or directly requested
    let installations: any[] = [];
    if (user) {
      const instRes = await this.env.DB.prepare(
        "SELECT id, equipment_name, organization_id, group_id, shell_version, sidc_version, status, created_at, updated_at FROM installations WHERE assigned_user_id = ?",
      )
        .bind(user.id)
        .all();
      installations = instRes.results ?? [];
    } else if (input.installation_id) {
      const instRes = await this.env.DB.prepare(
        "SELECT id, equipment_name, organization_id, group_id, shell_version, sidc_version, status, created_at, updated_at, assigned_user_id FROM installations WHERE id = ?",
      )
        .bind(input.installation_id)
        .all<any>();
      installations = instRes.results ?? [];
      if (installations.length > 0 && installations[0].assigned_user_id) {
        user = await this.env.DB.prepare(
          "SELECT id, organization_id, group_id, display_name, email, status, created_at, updated_at FROM managed_users WHERE id = ?",
        )
          .bind(installations[0].assigned_user_id)
          .first();
      }
    }

    // Terms acceptances for installations (legal evidence of acceptance, never purged on request)
    let termsAcceptances: any[] = [];
    if (installations.length > 0) {
      const instIds = installations.map((i) => i.id);
      const placeholders = instIds.map(() => "?").join(",");
      const termsRes = await this.env.DB.prepare(
        `SELECT id, installation_id, terms_version, terms_sha256, accepted_at_client, received_at, method, shell_version FROM terms_acceptances WHERE installation_id IN (${placeholders})`,
      )
        .bind(...instIds)
        .all();
      termsAcceptances = termsRes.results ?? [];
    }

    // Tickets
    const searchTerms: string[] = [];
    if (input.email) searchTerms.push(input.email);
    if (user?.email && user.email !== input.email) searchTerms.push(user.email);
    if (user?.display_name) searchTerms.push(user.display_name);

    let tickets: any[] = [];
    if (searchTerms.length > 0) {
      const placeholders = searchTerms.map(() => "?").join(",");
      const ticketsRes = await this.env.DB.prepare(
        `SELECT id, name, team, description, status, organization_id, created_at FROM tickets WHERE name IN (${placeholders})`,
      )
        .bind(...searchTerms)
        .all();
      tickets = ticketsRes.results ?? [];
    }

    // Events
    let events: any[] = [];
    if (installations.length > 0) {
      const instIds = installations.map((i) => i.id);
      const placeholders = instIds.map(() => "?").join(",");
      const eventsRes = await this.env.DB.prepare(
        `SELECT id, installation_id, type, actor, server_received_at FROM events WHERE installation_id IN (${placeholders}) ORDER BY server_received_at DESC LIMIT 500`,
      )
        .bind(...instIds)
        .all();
      events = eventsRes.results ?? [];
    }

    return {
      user: user ?? null,
      installations,
      terms_acceptances: termsAcceptances,
      tickets,
      events,
    };
  }

  async eraseData(
    actor: string,
    input: PrivacyEraseInput,
  ): Promise<TitularEraseResult> {
    const now = new Date().toISOString();
    let userErased = false;
    let userId: string | null = null;
    let userEmail: string | null = null;
    let userName: string | null = null;
    let installationsAnonymized = 0;

    if (input.managed_user_id) {
      const found = await this.env.DB.prepare(
        "SELECT id, display_name, email FROM managed_users WHERE id = ?",
      )
        .bind(input.managed_user_id)
        .first<{ id: string; display_name: string; email: string | null }>();
      if (found) {
        userId = found.id;
        userName = found.display_name;
        userEmail = found.email;
      }
    } else if (input.email) {
      const found = await this.env.DB.prepare(
        "SELECT id, display_name, email FROM managed_users WHERE email = ?",
      )
        .bind(input.email)
        .first<{ id: string; display_name: string; email: string | null }>();
      if (found) {
        userId = found.id;
        userName = found.display_name;
        userEmail = found.email;
      }
    }

    if (userId) {
      const anonEmail = `deleted-${userId}@deleted.local`;
      const instRes = await this.env.DB.prepare(
        "UPDATE installations SET equipment_name = '[Anonimizado]', sidc_target = '[Anonimizado]', assigned_user_id = NULL, updated_at = ? WHERE assigned_user_id = ?",
      )
        .bind(now, userId)
        .run();
      installationsAnonymized += instRes.meta.changes ?? 0;

      await this.env.DB.prepare(
        "UPDATE managed_users SET display_name = '[Anonimizado]', email = ?, status = 'disabled', updated_at = ? WHERE id = ?",
      )
        .bind(anonEmail, now, userId)
        .run();

      userErased = true;
    }

    if (input.installation_id) {
      const instRes = await this.env.DB.prepare(
        "UPDATE installations SET equipment_name = '[Anonimizado]', sidc_target = '[Anonimizado]', assigned_user_id = NULL, updated_at = ? WHERE id = ?",
      )
        .bind(now, input.installation_id)
        .run();
      installationsAnonymized += instRes.meta.changes ?? 0;
    }

    // Anonymize tickets
    const ticketIdentifiers = [input.email, userEmail, userName].filter(
      Boolean,
    ) as string[];
    let ticketsErased = 0;

    if (ticketIdentifiers.length > 0) {
      const placeholders = ticketIdentifiers.map(() => "?").join(",");
      const updateRes = await this.env.DB.prepare(
        `UPDATE tickets SET name = '[Anonimizado]', team = '[Anonimizado]', description = '[Anonimizado por ejercicio de derechos del titular]' WHERE name IN (${placeholders})`,
      )
        .bind(...ticketIdentifiers)
        .run();
      ticketsErased = updateRes.meta.changes ?? 0;
    }

    // Audit event: MUST NOT store any subject identifier (email, user id, or installation id)
    const subjectType = input.email
      ? "email"
      : input.installation_id
        ? "installation"
        : "managed_user";

    await this.env.DB.prepare(
      "INSERT INTO events (id, type, actor, server_received_at, payload_json) VALUES (?, 'privacy_erasure_performed', ?, ?, ?)",
    )
      .bind(
        crypto.randomUUID(),
        actor,
        now,
        JSON.stringify({
          reason: input.reason,
          mode: input.mode ?? "erase",
          subject_type: subjectType,
          user_erased: userErased,
          installations_anonymized: installationsAnonymized,
          tickets_erased: ticketsErased,
        }),
      )
      .run();

    return {
      erased: true,
      user_erased: userErased,
      installations_anonymized: installationsAnonymized,
      tickets_erased: ticketsErased,
    };
  }
}
