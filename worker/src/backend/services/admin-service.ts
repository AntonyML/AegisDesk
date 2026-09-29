import { eq } from "drizzle-orm";
import { addCalendarMonths, CycleReader, cyclePolicy } from "../domain/cycles";
import { RequestError } from "../errors";
import type {
  BulkInstallationsInput,
  CyclePatchInput,
  InstallationPatchInput,
  TicketPatchInput,
} from "../http/validation";
import { getDb } from "../persistence/db";
import { EventRepository } from "../persistence/repositories/event-repository";
import { InstallationRepository } from "../persistence/repositories/installation-repository";
import { TicketRepository } from "../persistence/repositories/ticket-repository";
import {
  cycles,
  type EventRecord,
  type InstallationRecord,
} from "../persistence/schema";
import { DirectoryService } from "./directory-service";

export class AdminService {
  private readonly events: EventRepository;
  private readonly installations: InstallationRepository;
  private readonly tickets: TicketRepository;
  private readonly cycles: CycleReader;
  private readonly directory: DirectoryService;

  constructor(
    private readonly env: Env,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.events = new EventRepository(env);
    this.installations = new InstallationRepository(env);
    this.tickets = new TicketRepository(env);
    this.cycles = new CycleReader(env);
    this.directory = new DirectoryService(env, now);
  }

  async listInstallations(orgId?: string | null): Promise<
    Array<
      InstallationRecord & {
        cycle: Awaited<ReturnType<CycleReader["activeCycle"]>>;
        organization: Awaited<
          ReturnType<DirectoryService["requireOrganization"]>
        >;
        group: Awaited<ReturnType<DirectoryService["requireGroup"]>>;
        assignedUser: Awaited<
          ReturnType<DirectoryService["requireManagedUser"]>
        >;
        latestTermsVersion: string | null;
        termsPending: boolean;
      }
    >
  > {
    const allRows = await this.installations.list();
    const rows = orgId
      ? allRows.filter((row) => row.organizationId === orgId)
      : allRows;
    const [organizations, groups, managedUsers, acceptances] =
      await Promise.all([
        this.directory.listOrganizations(orgId),
        this.directory.listGroups(orgId),
        this.directory.listManagedUsers(orgId),
        this.env.DB.prepare(
          "SELECT installation_id, terms_version, received_at FROM terms_acceptances ORDER BY received_at DESC",
        )
          .all<{
            installation_id: string;
            terms_version: string;
            received_at: string;
          }>()
          .catch(() => ({ results: [] })),
      ]);
    const organizationById = new Map(
      organizations.map((item) => [item.id, item]),
    );
    const groupById = new Map(groups.map((item) => [item.id, item]));
    const managedUserById = new Map(
      managedUsers.map((item) => [item.id, item]),
    );
    const latestTermsByInstallation = new Map<string, string>();
    for (const acc of acceptances.results ?? []) {
      if (!latestTermsByInstallation.has(acc.installation_id)) {
        latestTermsByInstallation.set(acc.installation_id, acc.terms_version);
      }
    }
    const requiredVersion = this.env.REQUIRED_TERMS_VERSION || "0.1.0";

    return Promise.all(
      rows.map(async (row) => {
        const latestTerms = latestTermsByInstallation.get(row.id) ?? null;
        return {
          ...row,
          cycle: await this.cycles.activeCycle(row.id),
          organization: row.organizationId
            ? (organizationById.get(row.organizationId) ?? null)
            : null,
          group: row.groupId ? (groupById.get(row.groupId) ?? null) : null,
          assignedUser: row.assignedUserId
            ? (managedUserById.get(row.assignedUserId) ?? null)
            : null,
          latestTermsVersion: latestTerms,
          termsPending: !latestTerms || latestTerms !== requiredVersion,
        };
      }),
    );
  }

  async listEvents(orgId?: string | null): Promise<EventRecord[]> {
    const recent = await this.events.recent(500);
    if (!orgId) return recent;

    const orgInstallations = new Set(
      (await this.installations.list())
        .filter((i) => i.organizationId === orgId)
        .map((i) => i.id),
    );
    return recent.filter(
      (e) => e.installationId && orgInstallations.has(e.installationId),
    );
  }

  async listTickets(orgId?: string | null) {
    const list = await this.tickets.list(200);
    if (!orgId) return list;
    return list.filter((t) => t.organizationId === orgId);
  }

  async revokeInstallation(
    id: string,
    actor: string,
    reason: string,
    orgId?: string | null,
  ): Promise<void> {
    const current = await this.installations.find(id);
    if (!current || (orgId && current.organizationId !== orgId)) {
      throw new RequestError("installation_not_found", 404);
    }
    const now = this.now().toISOString();
    if (!(await this.installations.revoke(id, now))) {
      throw new RequestError("installation_not_found", 404);
    }
    await this.events.insert({
      id: crypto.randomUUID(),
      installationId: id,
      serverReceivedAt: now,
      type: "admin_installation_revoked",
      actor,
      payloadJson: JSON.stringify({ reason }),
    });
  }

  async renewCycle(
    cycleId: string,
    actor: string,
    reason: string,
    orgId?: string | null,
  ) {
    const current = await getDb(this.env)
      .select()
      .from(cycles)
      .where(eq(cycles.id, cycleId))
      .get();
    if (!current) throw new RequestError("cycle_not_found", 404);
    if (orgId) {
      const inst = await this.installations.find(current.installationId);
      if (!inst || inst.organizationId !== orgId) {
        throw new RequestError("cycle_not_found", 404);
      }
    }
    const now = this.now().toISOString();
    const durationMonths = cyclePolicy.chooseDurationMonths();
    const dueAt = addCalendarMonths(
      new Date(now),
      durationMonths,
    ).toISOString();
    await this.env.DB.batch([
      this.env.DB.prepare(
        "UPDATE cycles SET status = 'closed' WHERE id = ?",
      ).bind(cycleId),
      this.env.DB.prepare(
        "INSERT INTO cycles (id, installation_id, started_at, duration_months, due_at, status, created_by, reason, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        current.installationId,
        now,
        durationMonths,
        dueAt,
        actor,
        reason,
        now,
      ),
    ]);
    await this.events.insert({
      id: crypto.randomUUID(),
      installationId: current.installationId,
      cycleId,
      serverReceivedAt: now,
      type: "admin_cycle_renewed",
      actor,
      payloadJson: JSON.stringify({
        reason,
        duration_months: durationMonths,
        due_at: dueAt,
      }),
    });
    return { duration_months: durationMonths, due_at: dueAt };
  }

  async adjustCycle(
    cycleId: string,
    actor: string,
    input: CyclePatchInput,
    orgId?: string | null,
  ) {
    const current = await getDb(this.env)
      .select()
      .from(cycles)
      .where(eq(cycles.id, cycleId))
      .get();
    if (!current) throw new RequestError("cycle_not_found", 404);
    if (orgId) {
      const inst = await this.installations.find(current.installationId);
      if (!inst || inst.organizationId !== orgId) {
        throw new RequestError("cycle_not_found", 404);
      }
    }
    const dueAt =
      input.due_at ??
      (input.duration_months
        ? addCalendarMonths(
            new Date(current.startedAt),
            input.duration_months,
          ).toISOString()
        : current.dueAt);
    await getDb(this.env)
      .update(cycles)
      .set({
        dueAt,
        durationMonths: input.duration_months ?? current.durationMonths,
        reason: input.reason,
        updatedAt: this.now().toISOString(),
      })
      .where(eq(cycles.id, cycleId))
      .run();
    await this.events.insert({
      id: crypto.randomUUID(),
      installationId: current.installationId,
      cycleId,
      serverReceivedAt: this.now().toISOString(),
      type: "admin_cycle_adjusted",
      actor,
      payloadJson: JSON.stringify({
        reason: input.reason,
        previous_due_at: current.dueAt,
        due_at: dueAt,
      }),
    });
    return { due_at: dueAt };
  }

  listOrganizations(orgId?: string | null) {
    return this.directory.listOrganizations(orgId);
  }

  listGroups(orgId?: string | null) {
    return this.directory.listGroups(orgId);
  }

  listManagedUsers(orgId?: string | null) {
    return this.directory.listManagedUsers(orgId);
  }

  async updateInstallation(
    id: string,
    actor: string,
    input: InstallationPatchInput,
    orgId?: string | null,
  ) {
    const current = await this.installations.find(id);
    if (!current || (orgId && current.organizationId !== orgId)) {
      throw new RequestError("installation_not_found", 404);
    }
    const status = input.status ?? current.status;
    const organizationId =
      orgId !== undefined && orgId !== null
        ? orgId
        : input.organization_id === undefined
          ? current.organizationId
          : input.organization_id;
    const groupId =
      input.group_id === undefined ? current.groupId : input.group_id;
    const assignedUserId =
      input.assigned_user_id === undefined
        ? current.assignedUserId
        : input.assigned_user_id;
    await this.directory.validateInstallationAssignment(
      organizationId,
      groupId,
      assignedUserId,
    );
    const now = this.now().toISOString();
    await this.installations.update(id, {
      status,
      equipmentName: input.equipment_name ?? current.equipmentName,
      sidcTarget: input.sidc_target ?? current.sidcTarget,
      organizationId,
      groupId,
      assignedUserId,
      updatedAt: now,
      revokedAt: status === "revoked" ? (current.revokedAt ?? now) : null,
    });
    await this.events.insert({
      id: crypto.randomUUID(),
      installationId: id,
      serverReceivedAt: now,
      type: "admin_installation_updated",
      actor,
      payloadJson: JSON.stringify({
        reason: input.reason,
        previous_status: current.status,
        status,
        organization_id: organizationId,
        group_id: groupId,
        assigned_user_id: assignedUserId,
      }),
    });
    return this.installations.find(id);
  }

  async updateTicket(
    id: string,
    actor: string,
    input: TicketPatchInput,
    orgId?: string | null,
  ): Promise<void> {
    const current = await this.tickets.find(id);
    if (!current || (orgId && current.organizationId !== orgId)) {
      throw new RequestError("ticket_not_found", 404);
    }
    if (input.status) await this.tickets.updateStatus(id, input.status);
    await this.events.insert({
      id: crypto.randomUUID(),
      serverReceivedAt: this.now().toISOString(),
      type: "admin_ticket_updated",
      actor,
      payloadJson: JSON.stringify({
        ticket_id: id,
        status: input.status,
        note: input.note ?? "",
      }),
    });
  }

  async bulkUpdateInstallations(
    actor: string,
    input: BulkInstallationsInput,
    orgId?: string | null,
  ): Promise<{ updated_count: number }> {
    const now = this.now().toISOString();
    let updatedCount = 0;
    for (const id of input.installation_ids) {
      const inst = await this.installations.find(id);
      if (!inst) continue;
      if (orgId && inst.organizationId !== orgId) continue;

      await this.installations.update(id, {
        status: input.status,
        updatedAt: now,
        revokedAt: input.status === "revoked" ? (inst.revokedAt ?? now) : null,
      });
      await this.events.insert({
        id: crypto.randomUUID(),
        installationId: id,
        serverReceivedAt: now,
        type: "admin_installation_updated",
        actor,
        payloadJson: JSON.stringify({
          reason: input.reason,
          status: input.status,
          bulk: true,
        }),
      });
      updatedCount++;
    }

    await this.events.insert({
      id: crypto.randomUUID(),
      serverReceivedAt: now,
      type: "admin_bulk_installations_updated",
      actor,
      payloadJson: JSON.stringify({
        reason: input.reason,
        status: input.status,
        count: updatedCount,
      }),
    });

    return { updated_count: updatedCount };
  }
}
