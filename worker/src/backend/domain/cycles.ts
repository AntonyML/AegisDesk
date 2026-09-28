import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "../persistence/db";
import { cycles, events } from "../persistence/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export type Cycle = {
  id: string;
  installationId: string;
  startedAt: string;
  durationMonths: number;
  dueAt: string;
  status: "active" | "closed";
};

export type Notice = {
  id: string;
  severity: "info" | "warning" | "critical";
  frequency:
    | "once_in_final_14_days"
    | "daily_in_final_7_days"
    | "each_open_after_expiry";
  title: string;
  message: string;
  closable: boolean;
  requires_consent: boolean;
  countdown_seconds: number;
};

type RandomSource = () => Uint32Array;

export class CyclePolicy {
  constructor(private readonly randomSource: RandomSource = randomUint32) {}

  chooseDurationMonths(random: Uint32Array = this.randomSource()): number {
    const sourceSize = 2 ** 32;
    const acceptedLimit = Math.floor(sourceSize / 5) * 5;
    let value = random[0] ?? 0;
    while (value >= acceptedLimit) {
      random = this.randomSource();
      value = random[0] ?? 0;
    }
    return 2 + (value % 5);
  }

  addCalendarMonths(start: Date, months: number): Date {
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + months;
    const targetYear = year + Math.floor(month / 12);
    const targetMonth = month % 12;
    const day = Math.min(
      start.getUTCDate(),
      daysInMonth(targetYear, targetMonth),
    );
    return new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        day,
        start.getUTCHours(),
        start.getUTCMinutes(),
        start.getUTCSeconds(),
        start.getUTCMilliseconds(),
      ),
    );
  }

  evaluate(
    now: Date,
    cycle: Cycle | null,
    eventsToday: string[],
    contactName: string,
  ): Notice | null {
    if (cycle?.status !== "active") return null;
    const remaining = Date.parse(cycle.dueAt) - now.getTime();
    const base = {
      id: `cycle-${cycle.id}`,
      title: "Mantenimiento de SIDC",
      closable: true,
      requires_consent: false,
      countdown_seconds: 0,
    } as const;

    if (remaining <= 0) {
      return {
        ...base,
        id: `expired-${cycle.id}`,
        severity: "critical",
        frequency: "each_open_after_expiry",
        message: `El mantenimiento está vencido. Contacta con ${contactName}.`,
        closable: false,
        requires_consent: true,
        countdown_seconds: 5,
      };
    }

    if (remaining > 14 * DAY_MS) return null;
    if (remaining > 7 * DAY_MS) {
      if (eventsToday.includes("notice:final_14_days")) return null;
      return {
        ...base,
        severity: "warning",
        frequency: "once_in_final_14_days",
        message: `El equipo entró en las dos semanas finales. Contacta con ${contactName}.`,
      };
    }

    if (eventsToday.includes("notice:final_7_days")) return null;
    return {
      ...base,
      severity: "warning",
      frequency: "daily_in_final_7_days",
      message: `Quedan siete días o menos para el mantenimiento. Contacta con ${contactName}.`,
    };
  }
}

export class CycleReader {
  constructor(private readonly env: Env) {}

  async activeCycle(installationId: string): Promise<Cycle | null> {
    const row = await getDb(this.env)
      .select()
      .from(cycles)
      .where(
        and(
          eq(cycles.installationId, installationId),
          eq(cycles.status, "active"),
        ),
      )
      .get();
    return row
      ? {
          id: row.id,
          installationId: row.installationId,
          startedAt: row.startedAt,
          durationMonths: row.durationMonths,
          dueAt: row.dueAt,
          status: row.status,
        }
      : null;
  }

  async noticeEventsToday(
    installationId: string,
    dayStart: string,
  ): Promise<string[]> {
    const dayEnd = new Date(Date.parse(dayStart) + DAY_MS).toISOString();
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
}

export const cyclePolicy = new CyclePolicy();

export function chooseDurationMonths(random?: Uint32Array): number {
  return cyclePolicy.chooseDurationMonths(random);
}

export function addCalendarMonths(start: Date, months: number): Date {
  return cyclePolicy.addCalendarMonths(start, months);
}

export function evaluate(
  now: Date,
  cycle: Cycle | null,
  eventsToday: string[],
  contactName: string,
): Notice | null {
  return cyclePolicy.evaluate(now, cycle, eventsToday, contactName);
}

function randomUint32(): Uint32Array {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
