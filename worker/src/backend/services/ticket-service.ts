import { RequestError } from "../errors";
import type { TicketInput } from "../http/validation";
import { TicketRepository } from "../persistence/repositories/ticket-repository";

const TICKET_TURNSTILE_ACTION = "ticket";

export class TicketService {
  private readonly tickets: TicketRepository;

  constructor(private readonly env: Env) {
    this.tickets = new TicketRepository(env);
  }

  async create(
    input: TicketInput,
    remoteIp: string | undefined,
    expectedHostname: string,
  ): Promise<{ ticket_id: string; notified: boolean }> {
    if (this.env.TICKET_RATE_LIMIT) {
      const result = await this.env.TICKET_RATE_LIMIT.limit({
        key: `ticket:${remoteIp ?? "unknown"}`,
      });
      if (!result.success) throw new RequestError("rate_limited", 429);
    }
    if (
      !(await this.verifyTurnstile(
        input.turnstile_token,
        remoteIp,
        expectedHostname,
      ))
    ) {
      throw new RequestError("turnstile_required", 400);
    }
    const existing = await this.tickets.find(input.idempotency_key);
    if (existing) {
      return { ticket_id: existing.id, notified: existing.notified };
    }
    await this.tickets.create({
      id: input.idempotency_key,
      createdAt: new Date().toISOString(),
      name: input.name,
      team: input.team,
      description: input.description,
      status: "open",
      notified: false,
    });
    const notified = await this.sendEmail(input);
    if (notified) {
      await this.tickets.markNotified(
        input.idempotency_key,
        new Date().toISOString(),
      );
    }
    return { ticket_id: input.idempotency_key, notified };
  }

  private async verifyTurnstile(
    token: string,
    remoteIp: string | undefined,
    expectedHostname: string,
  ): Promise<boolean> {
    if (
      String(this.env.ENVIRONMENT) !== "production" &&
      !this.env.TURNSTILE_SECRET
    ) {
      return true;
    }
    if (!this.env.TURNSTILE_SECRET) return false;
    const body = new URLSearchParams({
      secret: this.env.TURNSTILE_SECRET,
      response: token,
    });
    if (remoteIp) body.set("remoteip", remoteIp);
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    if (!response.ok) return false;
    const result = (await response.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };
    return (
      result.success === true &&
      result.action === TICKET_TURNSTILE_ACTION &&
      result.hostname === expectedHostname
    );
  }

  private async sendEmail(input: TicketInput): Promise<boolean> {
    if (
      !this.env.RESEND_API_KEY ||
      !this.env.NOTIFY_FROM ||
      !this.env.NOTIFY_DESTINATION
    ) {
      return false;
    }
    const text = [
      `Ticket: ${input.idempotency_key}`,
      `Nombre: ${input.name}`,
      `Equipo: ${input.team}`,
      "",
      input.description,
    ].join("\n");
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `aegisdesk-ticket-${input.idempotency_key}`,
        },
        body: JSON.stringify({
          from: this.env.NOTIFY_FROM,
          to: [this.env.NOTIFY_DESTINATION],
          subject: `AegisDesk ticket ${input.idempotency_key}`,
          text,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
