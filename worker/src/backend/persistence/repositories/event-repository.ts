import { and, desc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../db";
import { type EventRecord, events } from "../schema";

export class EventRepository {
  constructor(private readonly env: Env) {}

  async insert(values: typeof events.$inferInsert): Promise<void> {
    await getDb(this.env)
      .insert(events)
      .values(values)
      .onConflictDoNothing()
      .run();
  }

  async typesForDay(
    installationId: string,
    dayStart: string,
  ): Promise<string[]> {
    const dayEnd = new Date(
      Date.parse(dayStart) + 24 * 60 * 60 * 1000,
    ).toISOString();
    const rows = await getDb(this.env)
      .select({ type: events.type })
      .from(events)
      .where(
        and(
          eq(events.installationId, installationId),
          gte(events.serverReceivedAt, dayStart),
          lt(events.serverReceivedAt, dayEnd),
        ),
      )
      .all();
    return rows.map((row) => row.type);
  }

  async recent(limit: number): Promise<EventRecord[]> {
    return getDb(this.env)
      .select()
      .from(events)
      .orderBy(desc(events.serverReceivedAt))
      .limit(limit)
      .all();
  }

  async deleteBefore(cutoff: string): Promise<void> {
    await getDb(this.env)
      .delete(events)
      .where(lt(events.serverReceivedAt, cutoff))
      .run();
  }
}
