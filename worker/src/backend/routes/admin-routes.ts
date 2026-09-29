import { Hono } from "hono";
import { readJson, readReason } from "../http/body";
import {
  cyclePatchSchema,
  groupSchema,
  installationPatchSchema,
  managedUserSchema,
  organizationSchema,
  supportConfigSchema,
  ticketPatchSchema,
} from "../http/validation";
import { requireAdmin } from "../security/admin-auth";
import { AdminService } from "../services/admin-service";
import { DirectoryService } from "../services/directory-service";
import { EnrollmentService } from "../services/enrollment-service";
import { SupportConfigService } from "../services/support-config-service";

export function createAdminRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();
  routes.post("/api/v1/admin/enrollment-codes", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const result = await new EnrollmentService(c.env).createCode(actor);
    return c.json(result, 201);
  });

  routes.get("/api/v1/admin/installations", async (c) => {
    await requireAdmin(c.req.raw, c.env);
    return c.json({
      installations: await new AdminService(c.env).listInstallations(),
    });
  });

  routes.get("/api/v1/admin/events", async (c) => {
    await requireAdmin(c.req.raw, c.env);
    return c.json({ events: await new AdminService(c.env).listEvents() });
  });

  routes.get("/api/v1/admin/audit", async (c) => {
    await requireAdmin(c.req.raw, c.env);
    return c.json({ events: await new AdminService(c.env).listEvents() });
  });

  routes.get("/api/v1/admin/tickets", async (c) => {
    await requireAdmin(c.req.raw, c.env);
    return c.json({ tickets: await new AdminService(c.env).listTickets() });
  });

  routes.get("/api/v1/admin/organizations", async (c) => {
    await requireAdmin(c.req.raw, c.env);
    return c.json({
      organizations: await new AdminService(c.env).listOrganizations(),
    });
  });

  routes.post("/api/v1/admin/organizations", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const input = await readJson(c, organizationSchema);
    const organization = await new DirectoryService(c.env).createOrganization(
      actor,
      input,
    );
    return c.json({ organization }, 201);
  });

  routes.patch("/api/v1/admin/organizations/:id", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const input = await readJson(c, organizationSchema);
    const organization = await new DirectoryService(c.env).updateOrganization(
      c.req.param("id"),
      actor,
      input,
    );
    return c.json({ organization });
  });

  routes.get("/api/v1/admin/groups", async (c) => {
    await requireAdmin(c.req.raw, c.env);
    return c.json({ groups: await new AdminService(c.env).listGroups() });
  });

  routes.post("/api/v1/admin/groups", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const input = await readJson(c, groupSchema);
    const group = await new DirectoryService(c.env).createGroup(actor, input);
    return c.json({ group }, 201);
  });

  routes.patch("/api/v1/admin/groups/:id", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const input = await readJson(c, groupSchema);
    const group = await new DirectoryService(c.env).updateGroup(
      c.req.param("id"),
      actor,
      input,
    );
    return c.json({ group });
  });

  routes.get("/api/v1/admin/managed-users", async (c) => {
    await requireAdmin(c.req.raw, c.env);
    return c.json({
      managed_users: await new AdminService(c.env).listManagedUsers(),
    });
  });

  routes.post("/api/v1/admin/managed-users", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const input = await readJson(c, managedUserSchema);
    const managedUser = await new DirectoryService(c.env).createManagedUser(
      actor,
      input,
    );
    return c.json({ managed_user: managedUser }, 201);
  });

  routes.patch("/api/v1/admin/managed-users/:id", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const input = await readJson(c, managedUserSchema);
    const managedUser = await new DirectoryService(c.env).updateManagedUser(
      c.req.param("id"),
      actor,
      input,
    );
    return c.json({ managed_user: managedUser });
  });

  routes.get("/api/v1/admin/support-config", async (c) => {
    await requireAdmin(c.req.raw, c.env);
    const organizationId = c.req.query("organization_id") || null;
    return c.json({
      support_config: await new SupportConfigService(c.env).getStored(
        organizationId,
      ),
    });
  });

  routes.put("/api/v1/admin/support-config", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const input = await readJson(c, supportConfigSchema);
    const supportConfig = await new SupportConfigService(c.env).upsert(
      actor,
      input,
    );
    return c.json({ support_config: supportConfig });
  });

  routes.post("/api/v1/admin/installations/:id/revoke", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const reason = await readReason(c);
    await new AdminService(c.env).revokeInstallation(
      c.req.param("id"),
      actor,
      reason.reason,
    );
    return c.json({ revoked: true });
  });

  routes.patch("/api/v1/admin/installations/:id", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const input = await readJson(c, installationPatchSchema);
    const installation = await new AdminService(c.env).updateInstallation(
      c.req.param("id"),
      actor,
      input,
    );
    return c.json({ updated: true, installation });
  });

  routes.post("/api/v1/admin/cycles/:id/renew", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const reason = await readReason(c);
    const result = await new AdminService(c.env).renewCycle(
      c.req.param("id"),
      actor,
      reason.reason,
    );
    return c.json({ renewed: true, ...result });
  });

  routes.patch("/api/v1/admin/cycles/:id", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const input = await readJson(c, cyclePatchSchema);
    const result = await new AdminService(c.env).adjustCycle(
      c.req.param("id"),
      actor,
      input,
    );
    return c.json({ updated: true, ...result });
  });

  routes.patch("/api/v1/admin/tickets/:id", async (c) => {
    const actor = await requireAdmin(c.req.raw, c.env);
    const input = await readJson(c, ticketPatchSchema);
    await new AdminService(c.env).updateTicket(c.req.param("id"), actor, input);
    return c.json({ updated: true });
  });
  return routes;
}
