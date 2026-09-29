import type { Context } from "hono";
import {
  getTicketIssueSummary,
  isTicketCategory,
} from "../../shared/ticket-catalog";
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
  let raw: unknown;
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    try {
      raw = await c.req.parseBody();
    } catch {
      throw new RequestError("INVALID", 422, { field: "body" });
    }
  } else {
    try {
      raw = await c.req.json();
    } catch {
      throw new RequestError("INVALID", 422, { field: "body" });
    }
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new RequestError("INVALID", 422, { field: "body" });
  }
  const data = raw as Record<string, unknown>;
  const allowedFields = new Set([
    "name",
    "team",
    "category",
    "issue_code",
    "turnstile_token",
    "idempotency_key",
  ]);
  if (Object.keys(data).some((field) => !allowedFields.has(field))) {
    throw new RequestError("INVALID", 422, { field: "body" });
  }

  const readChoice = (
    value: unknown,
    field: "category" | "issue_code",
    maxLength: number,
  ): string => {
    if (typeof value !== "string") {
      throw new RequestError("INVALID", 422, { field });
    }
    if (value.length > maxLength) {
      throw new RequestError("TOO_LONG", 422, { field });
    }
    const normalized = value.trim();
    let hasControlCharacter = false;
    for (let index = 0; index < normalized.length; index++) {
      const code = normalized.charCodeAt(index);
      if ((code >= 0 && code <= 31) || code === 127) {
        hasControlCharacter = true;
        break;
      }
    }
    if (!normalized || hasControlCharacter) {
      throw new RequestError("INVALID", 422, { field });
    }
    return normalized;
  };

  const category = readChoice(data.category, "category", 32);
  const issueCode = readChoice(data.issue_code, "issue_code", 64);
  const description = getTicketIssueSummary(category, issueCode);
  if (!description) {
    throw new RequestError("INVALID", 422, {
      field: isTicketCategory(category) ? "issue_code" : "category",
    });
  }

  const validatedFields = {
    name: data.name,
    team: data.team,
    description,
    turnstile_token: data.turnstile_token,
    idempotency_key: data.idempotency_key,
  };
  const lengthLimits: Record<string, number> = {
    name: 128,
    team: 128,
    description: 4000,
    turnstile_token: 2048,
    idempotency_key: 128,
  };
  for (const [field, value] of Object.entries(validatedFields)) {
    if (typeof value === "string" && value.length > lengthLimits[field]) {
      throw new RequestError("TOO_LONG", 422, { field });
    }
    if (typeof value === "string") {
      for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if ((code >= 0 && code <= 31) || code === 127) {
          throw new RequestError("INVALID", 422, { field });
        }
      }
    }
  }

  const parsed = ticketSchema.safeParse(validatedFields);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const field =
      typeof firstIssue?.path[0] === "string" ? firstIssue.path[0] : "body";
    throw new RequestError("INVALID", 422, { field });
  }
  return parsed.data;
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
