import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const installations = sqliteTable(
  "installations",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    equipmentName: text("equipment_name").notNull(),
    sidcTarget: text("sidc_target").notNull(),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
    shellVersion: text("shell_version").notNull(),
    sidcVersion: text("sidc_version").notNull(),
    lastOpenedAt: text("last_opened_at"),
    status: text("status", { enum: ["active", "revoked"] })
      .notNull()
      .default("active"),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("installations_token_hash_unique").on(
      table.tokenHash,
    ),
    statusIdx: index("installations_status_idx").on(table.status),
    lastOpenedIdx: index("installations_last_opened_idx").on(
      table.lastOpenedAt,
    ),
  }),
);

export const enrollmentCodes = sqliteTable(
  "enrollment_codes",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdBy: text("created_by").notNull(),
  },
  (table) => ({
    codeHashUnique: uniqueIndex("enrollment_codes_code_hash_unique").on(
      table.codeHash,
    ),
    expiresIdx: index("enrollment_codes_expires_idx").on(table.expiresAt),
  }),
);

export const cycles = sqliteTable(
  "cycles",
  {
    id: text("id").primaryKey(),
    installationId: text("installation_id").notNull(),
    startedAt: text("started_at").notNull(),
    durationMonths: integer("duration_months").notNull(),
    dueAt: text("due_at").notNull(),
    status: text("status", { enum: ["active", "closed"] })
      .notNull()
      .default("active"),
    createdBy: text("created_by").notNull(),
    reason: text("reason").notNull(),
  },
  (table) => ({
    dueIdx: index("cycles_due_idx").on(table.dueAt),
    installationIdx: index("cycles_installation_idx").on(table.installationId),
  }),
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    installationId: text("installation_id"),
    cycleId: text("cycle_id"),
    openId: text("open_id"),
    serverReceivedAt: text("server_received_at").notNull(),
    type: text("type").notNull(),
    actor: text("actor"),
    shellVersion: text("shell_version"),
    sidcVersion: text("sidc_version"),
    windowsUser: text("windows_user"),
    equipmentName: text("equipment_name"),
    consentState: text("consent_state"),
    launchResult: text("launch_result"),
    payloadJson: text("payload_json").notNull().default("{}"),
  },
  (table) => ({
    installationTimeIdx: index("events_installation_time_idx").on(
      table.installationId,
      table.serverReceivedAt,
    ),
    typeTimeIdx: index("events_type_time_idx").on(
      table.type,
      table.serverReceivedAt,
    ),
    openTypeUnique: uniqueIndex("events_open_type_unique").on(
      table.openId,
      table.type,
    ),
  }),
);

export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    createdAt: text("created_at").notNull(),
    name: text("name").notNull(),
    team: text("team").notNull(),
    description: text("description").notNull(),
    status: text("status", {
      enum: ["open", "in_progress", "resolved", "spam"],
    })
      .notNull()
      .default("open"),
    notified: integer("notified", { mode: "boolean" }).notNull().default(false),
    notifiedAt: text("notified_at"),
  },
  (table) => ({
    statusTimeIdx: index("tickets_status_time_idx").on(
      table.status,
      table.createdAt,
    ),
  }),
);

export const schema = {
  installations,
  enrollmentCodes,
  cycles,
  events,
  tickets,
};
