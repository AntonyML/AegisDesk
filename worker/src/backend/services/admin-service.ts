import { eq } from "drizzle-orm";
import { addCalendarMonths, CycleReader, cyclePolicy } from "../domain/cycles";
import { RequestError } from "../errors";
import type {
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

  async listInstallations(): Promise<
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
      }
    >
  > {
    const rows = await this.installations.list();
    const [organizations, groups, managedUsers] = await Promise.all([
      this.directory.listOrganizations(),
      this.directory.listGroups(),
      this.directory.listManagedUsers(),
    ]);
    const organizationById = new Map(
      organizations.map((item) => [item.id, item]),
    );
    const groupById = new Map(groups.map((item) => [item.id, item]));
    const managedUserById = new Map(
      managedUsers.map((item) => [item.id, item]),
    );
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        cycle: await this.cycles.activeCycle(row.id),
        organization: row.organizationId
          ? (organizationById.get(row.organizationId) ?? null)
          : null,
        group: row.groupId ? (groupById.get(row.groupId) ?? null) : null,
        assignedUser: row.assignedUserId
          ? (managedUserById.get(row.assignedUserId) ?? null)
          : null,
      })),
    );
  }

  listEvents(): Promise<EventRecord[]> {
    return this.events.recent(500);
  }

  listTickets() {
    return this.tickets.list(200);
  }

  async revokeInstallation(
    id: string,
    actor: string,
    reason: string,
  ): Promise<void> {
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

  async renewCycle(cycleId: string, actor: string, reason: string) {
    const current = await getDb(this.env)
      .select()
      .from(cycles)
      .where(eq(cycles.id, cycleId))
      .get();
    if (!current) throw new RequestError("cycle_not_found", 404);
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

  async adjustCycle(cycleId: string, actor: string, input: CyclePatchInput) {
    const current = await getDb(this.env)
      .select()
      .from(cycles)
      .where(eq(cycles.id, cycleId))
      .get();
    if (!current) throw new RequestError("cycle_not_found", 404);
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

  listOrganizations() {
    return this.directory.listOrganizations();
  }

  listGroups() {
    return this.directory.listGroups();
  }

  listManagedUsers() {
    return this.directory.listManagedUsers();
  }

  async updateInstallation(
    id: string,
    actor: string,
    input: InstallationPatchInput,
  ) {
    const current = await this.installations.find(id);
    if (!current) throw new RequestError("installation_not_found", 404);
    const status = input.status ?? current.status;
    const organizationId =
      input.organization_id === undefined
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
  ): Promise<void> {
    const current = await this.tickets.find(id);
    if (!current) throw new RequestError("ticket_not_found", 404);
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
}
