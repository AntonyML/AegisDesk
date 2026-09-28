import { eq } from "drizzle-orm";
import { addCalendarMonths, CycleReader, cyclePolicy } from "../domain/cycles";
import { RequestError } from "../errors";
import type { CyclePatchInput, TicketPatchInput } from "../http/validation";
import { getDb } from "../persistence/db";
import { EventRepository } from "../persistence/repositories/event-repository";
import { InstallationRepository } from "../persistence/repositories/installation-repository";
import { TicketRepository } from "../persistence/repositories/ticket-repository";
import {
  cycles,
  type EventRecord,
  type InstallationRecord,
} from "../persistence/schema";

export class AdminService {
  private readonly events: EventRepository;
  private readonly installations: InstallationRepository;
  private readonly tickets: TicketRepository;
  private readonly cycles: CycleReader;

  constructor(
    private readonly env: Env,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.events = new EventRepository(env);
    this.installations = new InstallationRepository(env);
    this.tickets = new TicketRepository(env);
    this.cycles = new CycleReader(env);
  }

  async listInstallations(): Promise<
    Array<
      InstallationRecord & {
        cycle: Awaited<ReturnType<CycleReader["activeCycle"]>>;
      }
    >
  > {
    const rows = await this.installations.list();
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        cycle: await this.cycles.activeCycle(row.id),
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
        "INSERT INTO cycles (id, installation_id, started_at, duration_months, due_at, status, created_by, reason) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
      ).bind(
        crypto.randomUUID(),
        current.installationId,
        now,
        durationMonths,
        dueAt,
        actor,
        reason,
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
