import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../src";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    ENVIRONMENT: "test",
    PLATFORM_OWNER_EMAILS: "owner@test.com",
    ...overrides,
  } as unknown as Env;
}

async function req(
  path: string,
  options: {
    method?: string;
    email?: string;
    body?: unknown;
  } = {},
  workerEnv: Env = makeEnv(),
) {
  const headers: Record<string, string> = {
    "x-aegis-test-admin": "1",
    "content-type": "application/json",
    origin: "https://aegisdesk.test",
  };
  if (options.email) {
    headers["x-aegis-test-email"] = options.email;
  }
  return app.fetch(
    new Request(`https://aegisdesk.test${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
    workerEnv,
  );
}

describe("W-2 roles and organization isolation", () => {
  it("enforces deny-by-default for users without membership", async () => {
    const workerEnv = makeEnv();
    const res = await req(
      "/api/v1/admin/installations",
      { email: "unauthorized@test.com" },
      workerEnv,
    );
    expect(res.status).toBe(403);
  });

  it("enforces role permissions and organization anti-IDOR isolation across all endpoints", async () => {
    const workerEnv = makeEnv();

    const orgAId = "10000000-0000-4000-8000-00000000000a";
    const orgBId = "20000000-0000-4000-8000-00000000000b";
    const now = new Date().toISOString();

    // Seed Org A and Org B in D1
    await workerEnv.DB.batch([
      workerEnv.DB.prepare(
        "INSERT INTO organizations (id, name, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)",
      ).bind(orgAId, "Org Alpha", now, now),
      workerEnv.DB.prepare(
        "INSERT INTO organizations (id, name, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)",
      ).bind(orgBId, "Org Beta", now, now),
      // Memberships
      workerEnv.DB.prepare(
        "INSERT INTO admin_memberships (id, email, organization_id, role, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        "admin-a@test.com",
        orgAId,
        "org_admin",
        now,
        "system",
      ),
      workerEnv.DB.prepare(
        "INSERT INTO admin_memberships (id, email, organization_id, role, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        "viewer-a@test.com",
        orgAId,
        "org_viewer",
        now,
        "system",
      ),
      workerEnv.DB.prepare(
        "INSERT INTO admin_memberships (id, email, organization_id, role, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        "admin-b@test.com",
        orgBId,
        "org_admin",
        now,
        "system",
      ),
      // Org B resources
      workerEnv.DB.prepare(
        "INSERT INTO groups (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)",
      ).bind("group-b-1", orgBId, "Group B", now, now),
      workerEnv.DB.prepare(
        "INSERT INTO managed_users (id, organization_id, group_id, display_name, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
      ).bind(
        "user-b-1",
        orgBId,
        "group-b-1",
        "User Beta",
        "beta@test.com",
        now,
        now,
      ),
      workerEnv.DB.prepare(
        "INSERT INTO installations (id, token_hash, equipment_name, sidc_target, organization_id, group_id, assigned_user_id, created_at, updated_at, shell_version, sidc_version, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '1.0', '1.0', 'active')",
      ).bind(
        "inst-b-1",
        "token-hash-b",
        "PC-Beta",
        "C:\\SIDC.exe",
        orgBId,
        "group-b-1",
        "user-b-1",
        now,
        now,
      ),
      workerEnv.DB.prepare(
        "INSERT INTO cycles (id, installation_id, started_at, duration_months, due_at, status, created_by, reason, updated_at) VALUES (?, ?, ?, 3, ?, 'active', 'test', 'initial', ?)",
      ).bind("cycle-b-1", "inst-b-1", now, now, now),
      workerEnv.DB.prepare(
        "INSERT INTO tickets (id, name, team, description, status, notified, organization_id, created_at) VALUES (?, ?, ?, ?, 'open', 0, ?, ?)",
      ).bind(
        "ticket-b-1",
        "Ticket Beta",
        "Team B",
        "Issue in Beta",
        orgBId,
        now,
      ),
      workerEnv.DB.prepare(
        "INSERT INTO events (id, installation_id, cycle_id, server_received_at, type, payload_json) VALUES (?, ?, ?, ?, 'heartbeat', '{}')",
      ).bind("event-b-1", "inst-b-1", "cycle-b-1", now),
    ]);

    // 1. org_viewer: can read Org A resources, cannot mutate
    const viewerReadRes = await req(
      "/api/v1/admin/installations",
      { email: "viewer-a@test.com" },
      workerEnv,
    );
    expect(viewerReadRes.status).toBe(200);

    const viewerMutateRes = await req(
      "/api/v1/admin/enrollment-codes",
      { method: "POST", email: "viewer-a@test.com", body: {} },
      workerEnv,
    );
    expect(viewerMutateRes.status).toBe(403);

    const viewerMutateRes2 = await req(
      "/api/v1/admin/groups",
      {
        method: "POST",
        email: "viewer-a@test.com",
        body: { name: "New Group", organization_id: orgAId },
      },
      workerEnv,
    );
    expect(viewerMutateRes2.status).toBe(403);

    // 2. Org A Admin attempting to read Org B resources -> lists do not contain Org B
    const instList = (await (
      await req(
        "/api/v1/admin/installations",
        { email: "admin-a@test.com" },
        workerEnv,
      )
    ).json()) as { installations: Array<{ id: string }> };
    expect(instList.installations.some((i) => i.id === "inst-b-1")).toBe(false);

    const groupList = (await (
      await req(
        "/api/v1/admin/groups",
        { email: "admin-a@test.com" },
        workerEnv,
      )
    ).json()) as { groups: Array<{ id: string }> };
    expect(groupList.groups.some((g) => g.id === "group-b-1")).toBe(false);

    const userList = (await (
      await req(
        "/api/v1/admin/managed-users",
        { email: "admin-a@test.com" },
        workerEnv,
      )
    ).json()) as { managed_users: Array<{ id: string }> };
    expect(userList.managed_users.some((u) => u.id === "user-b-1")).toBe(false);

    const ticketList = (await (
      await req(
        "/api/v1/admin/tickets",
        { email: "admin-a@test.com" },
        workerEnv,
      )
    ).json()) as { tickets: Array<{ id: string }> };
    expect(ticketList.tickets.some((t) => t.id === "ticket-b-1")).toBe(false);

    const eventList = (await (
      await req(
        "/api/v1/admin/events",
        { email: "admin-a@test.com" },
        workerEnv,
      )
    ).json()) as { events: Array<{ id: string }> };
    expect(eventList.events.some((e) => e.id === "event-b-1")).toBe(false);

    // 3. Org A Admin attempting to access / mutate Org B resources by ID (Anti-IDOR) -> 404 always
    const patchInst = await req(
      "/api/v1/admin/installations/inst-b-1",
      {
        method: "PATCH",
        email: "admin-a@test.com",
        body: { equipment_name: "Hacked", reason: "testing idor" },
      },
      workerEnv,
    );
    expect(patchInst.status).toBe(404);

    const revokeInst = await req(
      "/api/v1/admin/installations/inst-b-1/revoke",
      {
        method: "POST",
        email: "admin-a@test.com",
        body: { reason: "testing idor" },
      },
      workerEnv,
    );
    expect(revokeInst.status).toBe(404);

    const renewCycle = await req(
      "/api/v1/admin/cycles/cycle-b-1/renew",
      {
        method: "POST",
        email: "admin-a@test.com",
        body: { reason: "testing idor" },
      },
      workerEnv,
    );
    expect(renewCycle.status).toBe(404);

    const adjustCycle = await req(
      "/api/v1/admin/cycles/cycle-b-1",
      {
        method: "PATCH",
        email: "admin-a@test.com",
        body: { reason: "testing idor", duration_months: 4 },
      },
      workerEnv,
    );
    expect(adjustCycle.status).toBe(404);

    const patchGroup = await req(
      "/api/v1/admin/groups/group-b-1",
      {
        method: "PATCH",
        email: "admin-a@test.com",
        body: { name: "Renamed", organization_id: orgAId },
      },
      workerEnv,
    );
    expect(patchGroup.status).toBe(404);

    const patchUser = await req(
      "/api/v1/admin/managed-users/user-b-1",
      {
        method: "PATCH",
        email: "admin-a@test.com",
        body: { display_name: "Renamed", organization_id: orgAId },
      },
      workerEnv,
    );
    expect(patchUser.status).toBe(404);

    const patchTicket = await req(
      "/api/v1/admin/tickets/ticket-b-1",
      {
        method: "PATCH",
        email: "admin-a@test.com",
        body: { status: "resolved" },
      },
      workerEnv,
    );
    expect(patchTicket.status).toBe(404);

    const patchOrg = await req(
      `/api/v1/admin/organizations/${orgBId}`,
      {
        method: "PATCH",
        email: "admin-a@test.com",
        body: { name: "Renamed Org" },
      },
      workerEnv,
    );
    expect(patchOrg.status).toBe(404);

    // Org admin cannot create an organization -> 403
    const createOrg = await req(
      "/api/v1/admin/organizations",
      {
        method: "POST",
        email: "admin-a@test.com",
        body: { name: "New Unauthorized Org" },
      },
      workerEnv,
    );
    expect(createOrg.status).toBe(403);

    // 4. Massive action confirmation: disabling an org requires confirm: true and reason
    const unconfirmedDisable = await req(
      `/api/v1/admin/organizations/${orgAId}`,
      {
        method: "PATCH",
        email: "admin-a@test.com",
        body: { name: "Org Alpha", status: "disabled" },
      },
      workerEnv,
    );
    expect(unconfirmedDisable.status).toBe(400);

    const confirmedDisable = await req(
      `/api/v1/admin/organizations/${orgAId}`,
      {
        method: "PATCH",
        email: "admin-a@test.com",
        body: {
          name: "Org Alpha",
          status: "disabled",
          confirm: true,
          reason: "Decommissioning Org Alpha",
        },
      },
      workerEnv,
    );
    expect(confirmedDisable.status).toBe(200);

    // 5. Platform Owner can manage platform-level resources
    const ownerCreateOrg = await req(
      "/api/v1/admin/organizations",
      { method: "POST", email: "owner@test.com", body: { name: "Org Gamma" } },
      workerEnv,
    );
    expect(ownerCreateOrg.status).toBe(201);
  });

  it("strictly rejects test auth headers in production mode or when ENVIRONMENT is not test (fails closed with 401)", async () => {
    // 1. In production mode with x-aegis-test-admin
    const prodEnv = makeEnv({ ENVIRONMENT: "production" });
    const prodRes = await req(
      "/api/v1/admin/installations",
      { email: "owner@test.com" },
      prodEnv,
    );
    expect(prodRes.status).toBe(401);
    const prodJson = (await prodRes.json()) as any;
    expect(prodJson.error).toBe("admin_auth_required");

    // 2. When ENVIRONMENT is undefined / missing
    const noEnv = makeEnv({ ENVIRONMENT: undefined as any });
    const noEnvRes = await req(
      "/api/v1/admin/installations",
      { email: "owner@test.com" },
      noEnv,
    );
    expect(noEnvRes.status).toBe(401);
  });
});
