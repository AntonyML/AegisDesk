import type { Context } from "hono";
import { RequestError } from "../errors";
import { type TicketInput, ticketSchema } from "./validation";

type RequestContext = Context<{ Bindings: Env }>;
type Schema<T> = {
  safeParse: (value: unknown) => { success: boolean; data?: T };
};

export async function readJson<T>(
  c: RequestContext,
  schema: Schema<T>,
): Promise<T> {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    throw new RequestError("invalid_json", 400);
  }
  const result = schema.safeParse(input);
  if (!result.success || result.data === undefined) {
    throw new RequestError("invalid_payload", 400);
  }
  return result.data;
}

export async function readTicketBody(c: RequestContext): Promise<TicketInput> {
  const contentType = c.req.header("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await c.req.parseBody();
    const result = ticketSchema.safeParse(form);
    if (!result.success) throw new RequestError("invalid_payload", 400);
    return result.data;
  }
  return readJson(c, ticketSchema);
}

export async function readReason(
  c: Pick<RequestContext, "req">,
): Promise<{ reason: string }> {
  return readJson(c as RequestContext, {
    safeParse(value: unknown) {
      const reason =
        typeof value === "object" && value !== null && "reason" in value
          ? (value as { reason?: unknown }).reason
          : undefined;
      return typeof reason === "string" &&
        reason.trim().length > 0 &&
        reason.length <= 512
        ? { success: true, data: { reason: reason.trim() } }
        : { success: false };
    },
  });
}
