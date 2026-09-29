import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex("organizations_name_unique").on(table.name),
    statusIdx: index("organizations_status_idx").on(table.status),
  }),
);

export const groups = sqliteTable(
  "groups",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    organizationNameUnique: uniqueIndex("groups_organization_name_unique").on(
      table.organizationId,
      table.name,
    ),
    organizationIdx: index("groups_organization_idx").on(table.organizationId),
  }),
);

export const managedUsers = sqliteTable(
  "managed_users",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    groupId: text("group_id").references(() => groups.id),
    displayName: text("display_name").notNull(),
    email: text("email"),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    organizationIdx: index("managed_users_organization_idx").on(
      table.organizationId,
    ),
    groupIdx: index("managed_users_group_idx").on(table.groupId),
    statusIdx: index("managed_users_status_idx").on(table.status),
  }),
);

export const installations = sqliteTable(
  "installations",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    equipmentName: text("equipment_name").notNull(),
    sidcTarget: text("sidc_target").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    revokedAt: text("revoked_at"),
    shellVersion: text("shell_version").notNull(),
    sidcVersion: text("sidc_version").notNull(),
    lastOpenedAt: text("last_opened_at"),
    status: text("status", { enum: ["active", "disabled", "revoked"] })
      .notNull()
      .default("active"),
    organizationId: text("organization_id").references(() => organizations.id),
    groupId: text("group_id").references(() => groups.id),
    assignedUserId: text("assigned_user_id").references(() => managedUsers.id),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("installations_token_hash_unique").on(
      table.tokenHash,
    ),
    statusIdx: index("installations_status_idx").on(table.status),
    lastOpenedIdx: index("installations_last_opened_idx").on(
      table.lastOpenedAt,
    ),
    organizationIdx: index("installations_organization_idx").on(
      table.organizationId,
    ),
    groupIdx: index("installations_group_idx").on(table.groupId),
    assignedUserIdx: index("installations_assigned_user_idx").on(
      table.assignedUserId,
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
    updatedAt: text("updated_at").notNull(),
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
    resolvedAt: text("resolved_at"),
    organizationId: text("organization_id").references(() => organizations.id),
  },
  (table) => ({
    statusTimeIdx: index("tickets_status_time_idx").on(
      table.status,
      table.createdAt,
    ),
    organizationIdx: index("tickets_organization_idx").on(table.organizationId),
  }),
);

export const supportConfigs = sqliteTable(
  "support_configs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organizations.id),
    title: text("title").notNull(),
    message: text("message").notNull(),
    notice: text("notice").notNull().default(""),
    areaName: text("area_name").notNull().default(""),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    hours: text("hours").notNull().default(""),
    ticketUrl: text("ticket_url"),
    docsUrl: text("docs_url"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    organizationUnique: uniqueIndex("support_configs_organization_unique").on(
      table.organizationId,
    ),
    updatedIdx: index("support_configs_updated_idx").on(table.updatedAt),
  }),
);

export const adminMemberships = sqliteTable(
  "admin_memberships",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    organizationId: text("organization_id").references(() => organizations.id),
    role: text("role", {
      enum: ["platform_owner", "org_admin", "org_viewer"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull(),
  },
  (table) => ({
    emailOrgUnique: uniqueIndex("admin_memberships_email_org_unique").on(
      table.email,
      table.organizationId,
    ),
    emailIdx: index("admin_memberships_email_idx").on(table.email),
    orgIdx: index("admin_memberships_org_idx").on(table.organizationId),
  }),
);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at").notNull(),
});

export const termsAcceptances = sqliteTable(
  "terms_acceptances",
  {
    id: text("id").primaryKey(),
    installationId: text("installation_id")
      .notNull()
      .references(() => installations.id),
    termsVersion: text("terms_version").notNull(),
    termsSha256: text("terms_sha256").notNull(),
    acceptedAtClient: text("accepted_at_client").notNull(),
    receivedAt: text("received_at").notNull(),
    method: text("method", {
      enum: ["installer", "first-run", "reacceptance"],
    }).notNull(),
    shellVersion: text("shell_version").notNull(),
  },
  (table) => ({
    installVersionUnique: uniqueIndex(
      "terms_acceptances_install_version_unique",
    ).on(table.installationId, table.termsVersion),
    installIdx: index("terms_acceptances_installation_idx").on(
      table.installationId,
    ),
  }),
);

export const schema = {
  organizations,
  groups,
  managedUsers,
  installations,
  enrollmentCodes,
  cycles,
  events,
  tickets,
  supportConfigs,
  adminMemberships,
  rateLimits,
  termsAcceptances,
};

export type OrganizationRecord = typeof organizations.$inferSelect;
export type GroupRecord = typeof groups.$inferSelect;
export type ManagedUserRecord = typeof managedUsers.$inferSelect;
export type InstallationRecord = typeof installations.$inferSelect;
export type EventRecord = typeof events.$inferSelect;
export type TicketRecord = typeof tickets.$inferSelect;
export type SupportConfigRecord = typeof supportConfigs.$inferSelect;
export type AdminMembershipRecord = typeof adminMemberships.$inferSelect;
export type RateLimitRecord = typeof rateLimits.$inferSelect;
export type TermsAcceptanceRecord = typeof termsAcceptances.$inferSelect;
