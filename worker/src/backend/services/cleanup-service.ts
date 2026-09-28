import { EventRepository } from "../persistence/repositories/event-repository";

const DAY_MS = 24 * 60 * 60 * 1000;

export class CleanupService {
  constructor(private readonly env: Env) {}

  async pruneEvents(now: Date = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - 365 * DAY_MS).toISOString();
    await new EventRepository(this.env).deleteBefore(cutoff);
  }
}
