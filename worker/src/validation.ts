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

export const ticketPatchSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "spam"]).optional(),
  note: z.string().trim().max(1000).optional(),
});
