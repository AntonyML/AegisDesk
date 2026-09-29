import { z } from "zod";

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
  windows_user: z.string().trim().min(1).max(128).optional(),
  equipment_name: z.string().trim().min(1).max(128).optional(),
  shell_version: z.string().trim().min(1).max(64).optional(),
  sidc_version: z.string().trim().min(1).max(64).optional(),
  consent_state: z
    .enum(["not_required", "required", "accepted", "declined"])
    .optional(),
  launch_result: z.enum(["success", "failed", "not_attempted"]).optional(),
});

export const ticketSchema = z.object({
  name: z.string().trim().min(1).max(128),
  team: z.string().trim().min(1).max(128),
  description: z.string().trim().min(1).max(4000),
  turnstile_token: z.string().trim().min(1).max(2048),
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
export type TicketInput = z.infer<typeof ticketSchema>;
export type CyclePatchInput = z.infer<typeof cyclePatchSchema>;
export type TicketPatchInput = z.infer<typeof ticketPatchSchema>;
export type InstallationPatchInput = z.infer<typeof installationPatchSchema>;
export type OrganizationInput = z.infer<typeof organizationSchema>;
export type GroupInput = z.infer<typeof groupSchema>;
export type ManagedUserInput = z.infer<typeof managedUserSchema>;
export type SupportConfigInput = z.infer<typeof supportConfigSchema>;
