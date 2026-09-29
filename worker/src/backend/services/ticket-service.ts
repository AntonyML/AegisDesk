import { RequestError } from "../errors";
import { type TicketInput, validateTicketInput } from "../http/validation";
import { TicketRepository } from "../persistence/repositories/ticket-repository";
import { checkRateLimit } from "../security/rate-limit";

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
    const validatedInput = validateTicketInput(input);

    await checkRateLimit(this.env, `ticket:${remoteIp ?? "unknown"}`, {
      limit: 10,
      windowSeconds: 60,
    });

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
      id: validatedInput.idempotency_key,
      createdAt: new Date().toISOString(),
      name: validatedInput.name,
      team: validatedInput.team,
      description: validatedInput.description,
      status: "open",
      notified: false,
    });
    const notified = await this.sendEmail(validatedInput);
    if (notified) {
      await this.tickets.markNotified(
        validatedInput.idempotency_key,
        new Date().toISOString(),
      );
    }
    return { ticket_id: validatedInput.idempotency_key, notified };
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
    const excerpt =
      input.description.length > 300
        ? `${input.description.slice(0, 300)}...`
        : input.description;
    const panelUrl = this.env.APP_URL
      ? `${this.env.APP_URL.replace(/\/$/, "")}/admin`
      : "Panel de administración";

    const text = [
      `Ticket ID: ${input.idempotency_key}`,
      `Nombre: ${input.name}`,
      `Equipo: ${input.team}`,
      "",
      "Extracto:",
      excerpt,
      "",
      `Ver detalle completo en el panel: ${panelUrl}`,
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
