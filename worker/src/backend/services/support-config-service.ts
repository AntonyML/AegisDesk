import { eq } from "drizzle-orm";
import { RequestError } from "../errors";
import type { SupportConfigInput } from "../http/validation";
import { getDb } from "../persistence/db";
import {
  organizations,
  type SupportConfigRecord,
  supportConfigs,
} from "../persistence/schema";

export type EffectiveSupportConfig = {
  title: string;
  message: string;
  notice: string;
  areaName: string;
  hours: string;
  contactEmail: string | null;
  contactPhone: string | null;
  ticketUrl: string | null;
  docsUrl: string | null;
  updatedAt: string;
};

const GLOBAL_ID = "global";

export class SupportConfigService {
  constructor(
    private readonly env: Env,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getForOrganization(
    organizationId: string | null,
  ): Promise<EffectiveSupportConfig> {
    const scoped = organizationId
      ? await getDb(this.env)
          .select()
          .from(supportConfigs)
          .where(eq(supportConfigs.organizationId, organizationId))
          .get()
      : null;
    const global =
      scoped ??
      (await getDb(this.env)
        .select()
        .from(supportConfigs)
        .where(eq(supportConfigs.id, GLOBAL_ID))
        .get());
    return global ? this.toEffective(global) : this.fromEnvironment();
  }

  async getStored(
    organizationId: string | null,
  ): Promise<SupportConfigRecord | null> {
    return (
      (organizationId
        ? await getDb(this.env)
            .select()
            .from(supportConfigs)
            .where(eq(supportConfigs.organizationId, organizationId))
            .get()
        : await getDb(this.env)
            .select()
            .from(supportConfigs)
            .where(eq(supportConfigs.id, GLOBAL_ID))
            .get()) ?? null
    );
  }

  async upsert(
    actor: string,
    input: SupportConfigInput,
  ): Promise<SupportConfigRecord> {
    if (input.organization_id) {
      const organization = await getDb(this.env)
        .select()
        .from(organizations)
        .where(eq(organizations.id, input.organization_id))
        .get();
      if (!organization) throw new RequestError("organization_not_found", 404);
    }
    const now = this.now().toISOString();
    const id = input.organization_id ?? GLOBAL_ID;
    const values = {
      id,
      organizationId: input.organization_id ?? null,
      title: input.title,
      message: input.message,
      notice: input.notice ?? "",
      areaName: input.area_name ?? "",
      contactEmail: input.contact_email ?? null,
      contactPhone: input.contact_phone ?? null,
      hours: input.hours ?? "",
      ticketUrl: input.ticket_url ?? null,
      docsUrl: input.docs_url ?? null,
      updatedAt: now,
    } satisfies typeof supportConfigs.$inferInsert;
    await getDb(this.env)
      .insert(supportConfigs)
      .values(values)
      .onConflictDoUpdate({
        target: supportConfigs.id,
        set: values,
      })
      .run();
    await this.recordAudit(actor, id);
    return (await this.getStored(
      input.organization_id ?? null,
    )) as SupportConfigRecord;
  }

  private toEffective(row: SupportConfigRecord): EffectiveSupportConfig {
    return {
      title: row.title,
      message: row.message,
      notice: row.notice,
      areaName: row.areaName,
      hours: row.hours,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      ticketUrl: row.ticketUrl,
      docsUrl: row.docsUrl,
      updatedAt: row.updatedAt,
    };
  }

  private fromEnvironment(): EffectiveSupportConfig {
    return {
      title: this.env.SUPPORT_TITLE || "Soporte AegisDesk",
      message:
        this.env.SUPPORT_MESSAGE ||
        "Contactá al área de soporte si necesitás ayuda con este equipo.",
      notice: this.env.SUPPORT_NOTICE || "",
      areaName:
        this.env.SUPPORT_AREA_NAME || this.env.CONTACT_NAME || "Soporte Aegis",
      hours: this.env.SUPPORT_HOURS || "",
      contactEmail: this.env.SUPPORT_EMAIL || null,
      contactPhone: this.env.SUPPORT_PHONE || null,
      ticketUrl: this.env.TICKET_URL || null,
      docsUrl: this.env.SUPPORT_DOCS_URL || null,
      updatedAt: "1970-01-01T00:00:00.000Z",
    };
  }

  private async recordAudit(actor: string, configId: string): Promise<void> {
    const { EventRepository } = await import(
      "../persistence/repositories/event-repository"
    );
    await new EventRepository(this.env).insert({
      id: crypto.randomUUID(),
      serverReceivedAt: this.now().toISOString(),
      type: "admin_support_config_updated",
      actor,
      payloadJson: JSON.stringify({ support_config_id: configId }),
    });
  }
}
