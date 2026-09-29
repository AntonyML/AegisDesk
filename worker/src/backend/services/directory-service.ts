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

  listOrganizations(): Promise<OrganizationRecord[]> {
    return getDb(this.env)
      .select()
      .from(organizations)
      .orderBy(asc(organizations.name))
      .all();
  }

  listGroups(): Promise<GroupRecord[]> {
    return getDb(this.env)
      .select()
      .from(groups)
      .orderBy(asc(groups.name))
      .all();
  }

  listManagedUsers(): Promise<ManagedUserRecord[]> {
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
  ): Promise<OrganizationRecord> {
    await this.requireOrganization(id);
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

  async createGroup(actor: string, input: GroupInput): Promise<GroupRecord> {
    await this.requireActiveOrganization(input.organization_id);
    const now = this.now().toISOString();
    const record = {
      id: crypto.randomUUID(),
      organizationId: input.organization_id,
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
  ): Promise<GroupRecord> {
    await this.requireGroup(id);
    await this.requireActiveOrganization(input.organization_id);
    await getDb(this.env)
      .update(groups)
      .set({
        organizationId: input.organization_id,
        name: input.name,
        status: input.status ?? "active",
        updatedAt: this.now().toISOString(),
      })
      .where(eq(groups.id, id))
      .run();
    await this.recordAudit("admin_group_updated", actor, id);
    return (await this.requireGroup(id)) as GroupRecord;
  }

  async createManagedUser(
    actor: string,
    input: ManagedUserInput,
  ): Promise<ManagedUserRecord> {
    await this.validateUserAssignment(input.organization_id, input.group_id);
    const now = this.now().toISOString();
    const record = {
      id: crypto.randomUUID(),
      organizationId: input.organization_id,
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
  ): Promise<ManagedUserRecord> {
    await this.requireManagedUser(id);
    await this.validateUserAssignment(input.organization_id, input.group_id);
    await getDb(this.env)
      .update(managedUsers)
      .set({
        organizationId: input.organization_id,
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
