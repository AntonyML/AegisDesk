import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { type TicketRecord, tickets } from "../schema";

export class TicketRepository {
  constructor(private readonly env: Env) {}

  async find(id: string): Promise<TicketRecord | null> {
    return (
      (await getDb(this.env)
        .select()
        .from(tickets)
        .where(eq(tickets.id, id))
        .get()) ?? null
    );
  }

  async list(limit: number): Promise<TicketRecord[]> {
    return getDb(this.env)
      .select()
      .from(tickets)
      .orderBy(desc(tickets.createdAt))
      .limit(limit)
      .all();
  }

  async create(values: typeof tickets.$inferInsert): Promise<void> {
    await getDb(this.env).insert(tickets).values(values).run();
  }

  async markNotified(id: string, notifiedAt: string): Promise<void> {
    await getDb(this.env)
      .update(tickets)
      .set({ notified: true, notifiedAt })
      .where(eq(tickets.id, id))
      .run();
  }

  async updateStatus(
    id: string,
    status: TicketRecord["status"],
  ): Promise<void> {
    const resolvedAt = status === "resolved" ? new Date().toISOString() : null;
    await getDb(this.env)
      .update(tickets)
      .set({ status, resolvedAt })
      .where(eq(tickets.id, id))
      .run();
  }
}
