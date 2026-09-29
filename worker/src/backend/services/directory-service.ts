import { asc, eq } from "drizzle-orm";
import { RequestError } from "../errors";
import type {
  GroupInput,
  ManagedUserInput,
  OrganizationInput,
} from "../http/validation";
import { getDb } from "../persistence/db";
import {
  type GroupRecord,
  groups,
  type ManagedUserRecord,
  managedUsers,
  type OrganizationRecord,
  organizations,
} from "../persistence/schema";

export class DirectoryService {
  constructor(
    private readonly env: Env,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listOrganizations(orgId?: string | null): Promise<OrganizationRecord[]> {
    if (orgId) {
      return getDb(this.env)
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .orderBy(asc(organizations.name))
        .all();
    }
    return getDb(this.env)
      .select()
      .from(organizations)
      .orderBy(asc(organizations.name))
      .all();
  }

  listGroups(orgId?: string | null): Promise<GroupRecord[]> {
    if (orgId) {
      return getDb(this.env)
        .select()
        .from(groups)
        .where(eq(groups.organizationId, orgId))
        .orderBy(asc(groups.name))
        .all();
    }
    return getDb(this.env)
      .select()
      .from(groups)
      .orderBy(asc(groups.name))
      .all();
  }

  listManagedUsers(orgId?: string | null): Promise<ManagedUserRecord[]> {
    if (orgId) {
      return getDb(this.env)
        .select()
        .from(managedUsers)
        .where(eq(managedUsers.organizationId, orgId))
        .orderBy(asc(managedUsers.displayName))
        .all();
    }
    return getDb(this.env)
      .select()
      .from(managedUsers)
      .orderBy(asc(managedUsers.displayName))
      .all();
  }

  async createOrganization(
    actor: string,
    input: OrganizationInput,
  ): Promise<OrganizationRecord> {
    const now = this.now().toISOString();
    const record = {
      id: crypto.randomUUID(),
      name: input.name,
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    } satisfies typeof organizations.$inferInsert;
    await getDb(this.env).insert(organizations).values(record).run();
    await this.recordAudit("admin_organization_created", actor, record.id);
    return (await this.requireOrganization(record.id)) as OrganizationRecord;
  }

  async updateOrganization(
    id: string,
    actor: string,
    input: OrganizationInput,
    orgId?: string | null,
  ): Promise<OrganizationRecord> {
    if (orgId && id !== orgId) {
      throw new RequestError("organization_not_found", 404);
    }
    await this.requireOrganization(id);
    if (input.status === "disabled") {
      if (!input.confirm || !input.reason) {
        throw new RequestError("confirmation_and_reason_required", 400);
      }
    }
    await getDb(this.env)
      .update(organizations)
      .set({
        name: input.name,
        status: input.status ?? "active",
        updatedAt: this.now().toISOString(),
      })
      .where(eq(organizations.id, id))
      .run();
    await this.recordAudit("admin_organization_updated", actor, id);
    return (await this.requireOrganization(id)) as OrganizationRecord;
  }

  async createGroup(
    actor: string,
    input: GroupInput,
    orgId?: string | null,
  ): Promise<GroupRecord> {
    const targetOrgId = orgId ?? input.organization_id;
    await this.requireActiveOrganization(targetOrgId);
    const now = this.now().toISOString();
    const record = {
      id: crypto.randomUUID(),
      organizationId: targetOrgId,
      name: input.name,
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    } satisfies typeof groups.$inferInsert;
    await getDb(this.env).insert(groups).values(record).run();
    await this.recordAudit("admin_group_created", actor, record.id);
    return (await this.requireGroup(record.id)) as GroupRecord;
  }

  async updateGroup(
    id: string,
    actor: string,
    input: GroupInput,
    orgId?: string | null,
  ): Promise<GroupRecord> {
    const current = await this.requireGroup(id);
    if (!current || (orgId && current.organizationId !== orgId)) {
      throw new RequestError("group_not_found", 404);
    }
    const targetOrgId = orgId ?? input.organization_id;
    await this.requireActiveOrganization(targetOrgId);
    const now = this.now().toISOString();

    const movingOrg = current.organizationId !== targetOrgId;
    if (movingOrg) {
      await this.env.DB.batch([
        this.env.DB.prepare(
          "UPDATE groups SET organization_id = ?, name = ?, status = ?, updated_at = ? WHERE id = ?",
        ).bind(targetOrgId, input.name, input.status ?? "active", now, id),
        this.env.DB.prepare(
          "UPDATE managed_users SET organization_id = ?, updated_at = ? WHERE group_id = ?",
        ).bind(targetOrgId, now, id),
        this.env.DB.prepare(
          "UPDATE installations SET assigned_user_id = NULL WHERE group_id = ? AND assigned_user_id IN (SELECT id FROM managed_users WHERE organization_id != ?)",
        ).bind(id, targetOrgId),
        this.env.DB.prepare(
          "UPDATE installations SET organization_id = ?, updated_at = ? WHERE group_id = ?",
        ).bind(targetOrgId, now, id),
      ]);
    } else {
      await getDb(this.env)
        .update(groups)
        .set({
          organizationId: targetOrgId,
          name: input.name,
          status: input.status ?? "active",
          updatedAt: now,
        })
        .where(eq(groups.id, id))
        .run();
    }
    await this.recordAudit("admin_group_updated", actor, id);
    return (await this.requireGroup(id)) as GroupRecord;
  }

  async createManagedUser(
    actor: string,
    input: ManagedUserInput,
    orgId?: string | null,
  ): Promise<ManagedUserRecord> {
    const targetOrgId = orgId ?? input.organization_id;
    await this.validateUserAssignment(targetOrgId, input.group_id);
    const now = this.now().toISOString();
    const record = {
      id: crypto.randomUUID(),
      organizationId: targetOrgId,
      groupId: input.group_id ?? null,
      displayName: input.display_name,
      email: input.email ?? null,
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    } satisfies typeof managedUsers.$inferInsert;
    await getDb(this.env).insert(managedUsers).values(record).run();
    await this.recordAudit("admin_managed_user_created", actor, record.id);
    return (await this.requireManagedUser(record.id)) as ManagedUserRecord;
  }

  async updateManagedUser(
    id: string,
    actor: string,
    input: ManagedUserInput,
    orgId?: string | null,
  ): Promise<ManagedUserRecord> {
    const current = await this.requireManagedUser(id);
    if (!current || (orgId && current.organizationId !== orgId)) {
      throw new RequestError("managed_user_not_found", 404);
    }
    const targetOrgId = orgId ?? input.organization_id;
    await this.validateUserAssignment(targetOrgId, input.group_id);
    await getDb(this.env)
      .update(managedUsers)
      .set({
        organizationId: targetOrgId,
        groupId: input.group_id ?? null,
        displayName: input.display_name,
        email: input.email ?? null,
        status: input.status ?? "active",
        updatedAt: this.now().toISOString(),
      })
      .where(eq(managedUsers.id, id))
      .run();
    await this.recordAudit("admin_managed_user_updated", actor, id);
    return (await this.requireManagedUser(id)) as ManagedUserRecord;
  }

  async requireOrganization(id: string): Promise<OrganizationRecord | null> {
    return (
      (await getDb(this.env)
        .select()
        .from(organizations)
        .where(eq(organizations.id, id))
        .get()) ?? null
    );
  }

  async requireGroup(id: string): Promise<GroupRecord | null> {
    return (
      (await getDb(this.env)
        .select()
        .from(groups)
        .where(eq(groups.id, id))
        .get()) ?? null
    );
  }

  async requireManagedUser(id: string): Promise<ManagedUserRecord | null> {
    return (
      (await getDb(this.env)
        .select()
        .from(managedUsers)
        .where(eq(managedUsers.id, id))
        .get()) ?? null
    );
  }

  async validateInstallationAssignment(
    organizationId: string | null,
    groupId: string | null,
    assignedUserId: string | null,
  ): Promise<void> {
    const organization = organizationId
      ? await this.requireOrganization(organizationId)
      : null;
    const group = groupId ? await this.requireGroup(groupId) : null;
    const user = assignedUserId
      ? await this.requireManagedUser(assignedUserId)
      : null;

    if (organizationId && organization?.status !== "active") {
      throw new RequestError("organization_not_available", 409);
    }
    if (groupId && group?.status !== "active") {
      throw new RequestError("group_not_available", 409);
    }
    if (assignedUserId && user?.status !== "active") {
      throw new RequestError("managed_user_not_available", 409);
    }
    if (group && organizationId !== group.organizationId) {
      throw new RequestError("assignment_organization_mismatch", 409);
    }
    if (user && organizationId !== user.organizationId) {
      throw new RequestError("assignment_organization_mismatch", 409);
    }
    if (user?.groupId && groupId !== user.groupId) {
      throw new RequestError("assignment_group_mismatch", 409);
    }
    if (group && user && user.groupId !== null && user.groupId !== group.id) {
      throw new RequestError("assignment_group_mismatch", 409);
    }
  }

  private async requireActiveOrganization(id: string): Promise<void> {
    const organization = await this.requireOrganization(id);
    if (organization?.status !== "active") {
      throw new RequestError("organization_not_available", 409);
    }
  }

  private async validateUserAssignment(
    organizationId: string,
    groupId: string | null | undefined,
  ): Promise<void> {
    await this.requireActiveOrganization(organizationId);
    if (!groupId) return;
    const group = await this.requireGroup(groupId);
    if (group?.status !== "active" || group.organizationId !== organizationId) {
      throw new RequestError("assignment_organization_mismatch", 409);
    }
  }

  private async recordAudit(type: string, actor: string, entityId: string) {
    const { EventRepository } = await import(
      "../persistence/repositories/event-repository"
    );
    await new EventRepository(this.env).insert({
      id: crypto.randomUUID(),
      serverReceivedAt: this.now().toISOString(),
      type,
      actor,
      payloadJson: JSON.stringify({ entity_id: entityId }),
    });
  }
}
