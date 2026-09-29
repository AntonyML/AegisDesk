import { z } from "zod";
import { RequestError } from "../errors";
import { containsSensitiveData } from "../security/sensitive-data";

export const enrollmentSchema = z.object({
  protocol_version: z.literal(1),
  shell_version: z.string().trim().min(1).max(64),
  sidc_version: z.string().trim().min(1).max(64),
  equipment_name: z.string().trim().min(1).max(128),
  sidc_target: z.string().trim().min(1).max(512),
});

export const stateSchema = z.object({
  protocol_version: z.literal(1),
  install_id: z.string().uuid(),
  open_id: z.string().uuid(),
  shell_version: z.string().trim().min(1).max(64),
  sidc_version: z.string().trim().min(1).max(64),
});

export const eventSchema = z.object({
  protocol_version: z.literal(1),
  open_id: z.string().uuid(),
  type: z.enum([
    "launch_result",
    "consent_required",
    "countdown_completed",
    "consent_accepted",
    "consent_declined",
  ]),
  equipment_name: z.string().trim().min(1).max(128).optional(),
  shell_version: z.string().trim().min(1).max(64).optional(),
  sidc_version: z.string().trim().min(1).max(64).optional(),
  consent_state: z
    .enum(["not_required", "required", "accepted", "declined"])
    .optional(),
  launch_result: z.enum(["success", "failed", "not_attempted"]).optional(),
});

function hasControlChars(val: string): boolean {
  for (let i = 0; i < val.length; i++) {
    const code = val.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

function hasMultilineControlChars(val: string): boolean {
  for (let i = 0; i < val.length; i++) {
    const code = val.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13) continue;
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

const noControlChars = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((val) => !hasControlChars(val), "control_characters_not_allowed");

const multilineNoControlChars = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (val) => !hasMultilineControlChars(val),
      "control_characters_not_allowed",
    );

export const ticketSchema = z.object({
  name: noControlChars(128),
  team: noControlChars(128),
  description: multilineNoControlChars(4000),
  turnstile_token: noControlChars(2048),
  idempotency_key: z.string().uuid(),
});

export const cyclePatchSchema = z.object({
  duration_months: z.number().int().min(2).max(6).optional(),
  due_at: z.string().datetime().optional(),
  reason: z.string().trim().min(1).max(512),
});

const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[<>]/.test(value), "html_not_allowed");

const optionalPlainText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/[<>]/.test(value), "html_not_allowed")
    .optional()
    .nullable();

const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => value.startsWith("https://"), "https_url_required");

export const installationPatchSchema = z.object({
  status: z.enum(["active", "disabled", "revoked"]).optional(),
  equipment_name: plainText(128).optional(),
  sidc_target: plainText(512).optional(),
  organization_id: z.string().uuid().nullable().optional(),
  group_id: z.string().uuid().nullable().optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  reason: plainText(512),
});

export const organizationSchema = z.object({
  name: plainText(128),
  status: z.enum(["active", "disabled"]).optional(),
  confirm: z.boolean().optional(),
  reason: optionalPlainText(512),
});

export const bulkInstallationsSchema = z.object({
  installation_ids: z.array(z.string().uuid()).min(1).max(500),
  status: z.enum(["disabled", "revoked"]),
  reason: plainText(512),
  confirm: z.literal(true),
});

export const groupSchema = z.object({
  name: plainText(128),
  organization_id: z.string().uuid(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const managedUserSchema = z.object({
  display_name: plainText(128),
  email: z.string().trim().email().max(320).nullable().optional(),
  organization_id: z.string().uuid(),
  group_id: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const supportConfigSchema = z.object({
  organization_id: z.string().uuid().nullable().optional(),
  title: plainText(128),
  message: plainText(2000),
  notice: optionalPlainText(1000),
  area_name: optionalPlainText(128),
  contact_email: z.string().trim().email().max(320).nullable().optional(),
  contact_phone: z
    .string()
    .trim()
    .regex(/^[+()\d .-]{7,32}$/)
    .nullable()
    .optional(),
  hours: optionalPlainText(256),
  ticket_url: httpsUrl.nullable().optional(),
  docs_url: httpsUrl.nullable().optional(),
});

export const ticketPatchSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "spam"]).optional(),
  note: z.string().trim().max(1000).optional(),
});

export type EnrollmentInput = z.infer<typeof enrollmentSchema>;
export type StateInput = z.infer<typeof stateSchema>;
export type EventInput = z.infer<typeof eventSchema>;
export const termsAcceptanceSchema = z.object({
  termsVersion: z.string().trim().min(1).max(64),
  termsSha256: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/i),
  acceptedAt: z.string().datetime(),
  method: z.enum(["installer", "first-run", "reacceptance"]),
  shellVersion: z.string().trim().min(1).max(64).optional(),
});

export type TicketInput = z.infer<typeof ticketSchema>;
export type CyclePatchInput = z.infer<typeof cyclePatchSchema>;
export type TicketPatchInput = z.infer<typeof ticketPatchSchema>;
export type InstallationPatchInput = z.infer<typeof installationPatchSchema>;
export type OrganizationInput = z.infer<typeof organizationSchema>;
export type GroupInput = z.infer<typeof groupSchema>;
export type ManagedUserInput = z.infer<typeof managedUserSchema>;
export type SupportConfigInput = z.infer<typeof supportConfigSchema>;
export type BulkInstallationsInput = z.infer<typeof bulkInstallationsSchema>;
export type TermsAcceptanceInput = z.infer<typeof termsAcceptanceSchema>;

export const privacyExportSchema = z
  .object({
    email: z.string().trim().email().max(320).optional(),
    managed_user_id: z.string().uuid().optional(),
    installation_id: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      Boolean(data.email || data.managed_user_id || data.installation_id),
    {
      message: "Debe especificarse email, managed_user_id o installation_id",
    },
  );

export const privacyEraseSchema = z
  .object({
    email: z.string().trim().email().max(320).optional(),
    managed_user_id: z.string().uuid().optional(),
    installation_id: z.string().uuid().optional(),
    mode: z.enum(["erase", "delete", "anonymize"]).optional().default("erase"),
    reason: z.string().trim().min(1).max(512),
  })
  .refine(
    (data) =>
      Boolean(data.email || data.managed_user_id || data.installation_id),
    {
      message: "Debe especificarse email, managed_user_id o installation_id",
    },
  );

export type PrivacyExportInput = z.infer<typeof privacyExportSchema>;
export type PrivacyEraseInput = z.infer<typeof privacyEraseSchema>;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateTicketInput(raw: unknown): TicketInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new RequestError("INVALID", 422, { field: "body" });
  }

  const data = raw as Record<string, unknown>;

  // 1. name
  if (
    data.name === undefined ||
    data.name === null ||
    typeof data.name !== "string"
  ) {
    throw new RequestError("INVALID", 422, { field: "name" });
  }
  if (data.name.length > 128) {
    throw new RequestError("TOO_LONG", 422, { field: "name" });
  }
  const name = data.name.trim();
  if (name.length === 0 || hasControlChars(name)) {
    throw new RequestError("INVALID", 422, { field: "name" });
  }

  // 2. team
  if (
    data.team === undefined ||
    data.team === null ||
    typeof data.team !== "string"
  ) {
    throw new RequestError("INVALID", 422, { field: "team" });
  }
  if (data.team.length > 128) {
    throw new RequestError("TOO_LONG", 422, { field: "team" });
  }
  const team = data.team.trim();
  if (team.length === 0 || hasControlChars(team)) {
    throw new RequestError("INVALID", 422, { field: "team" });
  }

  // 3. description
  if (
    data.description === undefined ||
    data.description === null ||
    typeof data.description !== "string"
  ) {
    throw new RequestError("INVALID", 422, { field: "description" });
  }
  if (data.description.length > 4000) {
    throw new RequestError("TOO_LONG", 422, { field: "description" });
  }
  const description = data.description.trim();
  if (description.length === 0 || hasMultilineControlChars(description)) {
    throw new RequestError("INVALID", 422, { field: "description" });
  }
  if (containsSensitiveData(description)) {
    throw new RequestError("SENSITIVE_DATA_SUSPECTED", 422, {
      field: "description",
    });
  }

  // 4. turnstile_token
  if (
    data.turnstile_token === undefined ||
    data.turnstile_token === null ||
    typeof data.turnstile_token !== "string"
  ) {
    throw new RequestError("INVALID", 422, { field: "turnstile_token" });
  }
  if (data.turnstile_token.length > 2048) {
    throw new RequestError("TOO_LONG", 422, { field: "turnstile_token" });
  }
  const turnstileToken = data.turnstile_token.trim();
  if (turnstileToken.length === 0 || hasControlChars(turnstileToken)) {
    throw new RequestError("INVALID", 422, { field: "turnstile_token" });
  }

  // 5. idempotency_key
  if (
    data.idempotency_key === undefined ||
    data.idempotency_key === null ||
    typeof data.idempotency_key !== "string"
  ) {
    throw new RequestError("INVALID", 422, { field: "idempotency_key" });
  }
  if (data.idempotency_key.length > 128) {
    throw new RequestError("TOO_LONG", 422, { field: "idempotency_key" });
  }
  const idempotencyKey = data.idempotency_key.trim();
  if (!UUID_REGEX.test(idempotencyKey)) {
    throw new RequestError("INVALID", 422, { field: "idempotency_key" });
  }

  return {
    name,
    team,
    description,
    turnstile_token: turnstileToken,
    idempotency_key: idempotencyKey,
  };
}
