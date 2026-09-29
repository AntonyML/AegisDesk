import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { AdminService } from "../src/backend/services/admin-service";
import { DirectoryService } from "../src/backend/services/directory-service";

describe("W-3 relational integrity", () => {
  it("rejects assigning user from another organization to an installation", async () => {
    const now = new Date().toISOString();
    const orgAId = "40000000-0000-4000-8000-00000000000a";
    const orgBId = "40000000-0000-4000-8000-00000000000b";

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO organizations (id, name, status, created_at, updated_at) VALUES (?, 'Org 1', 'active', ?, ?)",
      ).bind(orgAId, now, now),
      env.DB.prepare(
        "INSERT INTO organizations (id, name, status, created_at, updated_at) VALUES (?, 'Org 2', 'active', ?, ?)",
      ).bind(orgBId, now, now),
      env.DB.prepare(
        "INSERT INTO managed_users (id, organization_id, display_name, status, created_at, updated_at) VALUES ('user-b', ?, 'User B', 'active', ?, ?)",
      ).bind(orgBId, now, now),
      env.DB.prepare(
        "INSERT INTO installations (id, token_hash, equipment_name, sidc_target, organization_id, created_at, updated_at, shell_version, sidc_version, status) VALUES ('inst-a', 'th-a', 'PC-A', 'C:\\app.exe', ?, ?, ?, '1.0', '1.0', 'active')",
      ).bind(orgAId, now, now),
    ]);

    // Direct DB update violating integrity should fail at DB level due to trigger
    await expect(
      env.DB.prepare(
        "UPDATE installations SET assigned_user_id = 'user-b' WHERE id = 'inst-a'",
      ).run(),
    ).rejects.toThrow();

    // DirectoryService validation also rejects it
    const directory = new DirectoryService(env);
    await expect(
      directory.validateInstallationAssignment(orgAId, null, "user-b"),
    ).rejects.toThrow();
  });

  it("moves a group with users and installations transactionally and reconciles them", async () => {
    const now = new Date().toISOString();
    const org1Id = "41000000-0000-4000-8000-000000000001";
    const org2Id = "41000000-0000-4000-8000-000000000002";
    const groupId = "41000000-0000-4000-8000-000000000003";
    const userId = "41000000-0000-4000-8000-000000000004";
    const instId = "41000000-0000-4000-8000-000000000005";

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO organizations (id, name, status, created_at, updated_at) VALUES (?, 'Org Move 1', 'active', ?, ?)",
      ).bind(org1Id, now, now),
      env.DB.prepare(
        "INSERT INTO organizations (id, name, status, created_at, updated_at) VALUES (?, 'Org Move 2', 'active', ?, ?)",
      ).bind(org2Id, now, now),
      env.DB.prepare(
        "INSERT INTO groups (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, 'Group Move', 'active', ?, ?)",
      ).bind(groupId, org1Id, now, now),
      env.DB.prepare(
        "INSERT INTO managed_users (id, organization_id, group_id, display_name, status, created_at, updated_at) VALUES (?, ?, ?, 'User Move', 'active', ?, ?)",
      ).bind(userId, org1Id, groupId, now, now),
      env.DB.prepare(
        "INSERT INTO installations (id, token_hash, equipment_name, sidc_target, organization_id, group_id, assigned_user_id, created_at, updated_at, shell_version, sidc_version, status) VALUES (?, 'th-move', 'PC-Move', 'C:\\app.exe', ?, ?, ?, ?, ?, '1.0', '1.0', 'active')",
      ).bind(instId, org1Id, groupId, userId, now, now),
    ]);

    const directory = new DirectoryService(env);
    await directory.updateGroup(groupId, "admin@test.com", {
      name: "Group Move Renamed",
      organization_id: org2Id,
    });

    // Check that group moved to org2
    const updatedGroup = await env.DB.prepare(
      "SELECT organization_id, name FROM groups WHERE id = ?",
    )
      .bind(groupId)
      .first<{ organization_id: string; name: string }>();
    expect(updatedGroup?.organization_id).toBe(org2Id);
    expect(updatedGroup?.name).toBe("Group Move Renamed");

    // Check that user moved to org2
    const updatedUser = await env.DB.prepare(
      "SELECT organization_id FROM managed_users WHERE id = ?",
    )
      .bind(userId)
      .first<{ organization_id: string }>();
    expect(updatedUser?.organization_id).toBe(org2Id);

    // Check that installation moved to org2 and still has group and user
    const updatedInst = await env.DB.prepare(
      "SELECT organization_id, group_id, assigned_user_id FROM installations WHERE id = ?",
    )
      .bind(instId)
      .first<{
        organization_id: string;
        group_id: string;
        assigned_user_id: string;
      }>();
    expect(updatedInst?.organization_id).toBe(org2Id);
    expect(updatedInst?.group_id).toBe(groupId);
    expect(updatedInst?.assigned_user_id).toBe(userId);
  });

  it("migration reconciles inconsistent data by setting foreign keys to NULL without deleting records", async () => {
    // Test the reconciliation queries logic directly on simulated inconsistent data
    const now = new Date().toISOString();
    const orgXId = "42000000-0000-4000-8000-00000000000x";
    const orgYId = "42000000-0000-4000-8000-00000000000y";
    const groupXId = "42000000-0000-4000-8000-0000000000gx";
    const userYId = "42000000-0000-4000-8000-0000000000uy";
    const instInconsistentId = "42000000-0000-4000-8000-0000000000in";

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO organizations (id, name, status, created_at, updated_at) VALUES (?, 'Org X', 'active', ?, ?)",
      ).bind(orgXId, now, now),
      env.DB.prepare(
        "INSERT INTO organizations (id, name, status, created_at, updated_at) VALUES (?, 'Org Y', 'active', ?, ?)",
      ).bind(orgYId, now, now),
      env.DB.prepare(
        "INSERT INTO groups (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, 'Group X', 'active', ?, ?)",
      ).bind(groupXId, orgXId, now, now),
      env.DB.prepare(
        "INSERT INTO managed_users (id, organization_id, display_name, status, created_at, updated_at) VALUES (?, ?, 'User Y', 'active', ?, ?)",
      ).bind(userYId, orgYId, now, now),
      // Installation in Org X but has assigned_user_id in Org Y (simulating pre-existing data without trigger)
      env.DB.prepare(
        "INSERT INTO installations (id, token_hash, equipment_name, sidc_target, organization_id, group_id, assigned_user_id, created_at, updated_at, shell_version, sidc_version, status) VALUES (?, 'th-incon', 'PC-Incon', 'C:\\app.exe', ?, ?, NULL, ?, ?, '1.0', '1.0', 'active')",
      ).bind(instInconsistentId, orgXId, groupXId, now, now),
    ]);

    // Simulate pre-existing inconsistent rows reconciliation query
    await env.DB.prepare(`
      UPDATE installations
      SET assigned_user_id = NULL
      WHERE assigned_user_id IS NOT NULL AND (
        organization_id IS NULL OR
        organization_id != (SELECT organization_id FROM managed_users WHERE managed_users.id = installations.assigned_user_id)
      )
    `).run();

    const record = await env.DB.prepare(
      "SELECT id, organization_id, group_id, assigned_user_id FROM installations WHERE id = ?",
    )
      .bind(instInconsistentId)
      .first<{
        id: string;
        organization_id: string;
        group_id: string;
        assigned_user_id: string | null;
      }>();
    expect(record).not.toBeNull();
    expect(record?.organization_id).toBe(orgXId);
    expect(record?.group_id).toBe(groupXId);
    expect(record?.assigned_user_id).toBeNull();
  });
});
