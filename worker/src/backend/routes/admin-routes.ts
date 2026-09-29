import { Hono } from "hono";
import { readJson, readReason } from "../http/body";
import {
  bulkInstallationsSchema,
  cyclePatchSchema,
  groupSchema,
  installationPatchSchema,
  managedUserSchema,
  organizationSchema,
  privacyEraseSchema,
  privacyExportSchema,
  supportConfigSchema,
  ticketPatchSchema,
} from "../http/validation";
import { requireAdmin } from "../security/admin-auth";
import { adminCsrfProtection } from "../security/csrf";
import { checkRateLimit } from "../security/rate-limit";
import { AdminService } from "../services/admin-service";
import { DirectoryService } from "../services/directory-service";
import { EnrollmentService } from "../services/enrollment-service";
import { PrivacyService } from "../services/privacy-service";
import { SupportConfigService } from "../services/support-config-service";

export function createAdminRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();

  routes.use("*", adminCsrfProtection);

  // 1. Enrollment codes: minimum org_admin
  routes.post("/api/v1/admin/enrollment-codes", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const result = await new EnrollmentService(c.env).createCode(session.actor);
    return c.json(result, 201);
  });

  // 2. Installations: org_viewer
  routes.get("/api/v1/admin/installations", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_viewer");
    return c.json({
      installations: await new AdminService(c.env).listInstallations(
        session.organizationId,
      ),
    });
  });

  // 3. Events: org_viewer
  routes.get("/api/v1/admin/events", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_viewer");
    return c.json({
      events: await new AdminService(c.env).listEvents(session.organizationId),
    });
  });

  // 4. Audit: org_viewer
  routes.get("/api/v1/admin/audit", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_viewer");
    return c.json({
      events: await new AdminService(c.env).listEvents(session.organizationId),
    });
  });

  // 5. Tickets: org_viewer
  routes.get("/api/v1/admin/tickets", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_viewer");
    return c.json({
      tickets: await new AdminService(c.env).listTickets(
        session.organizationId,
      ),
    });
  });

  // 6. Organizations list: org_viewer
  routes.get("/api/v1/admin/organizations", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_viewer");
    return c.json({
      organizations: await new AdminService(c.env).listOrganizations(
        session.organizationId,
      ),
    });
  });

  // 7. Organizations create: platform_owner ONLY
  routes.post("/api/v1/admin/organizations", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "platform_owner");
    const input = await readJson(c, organizationSchema);
    const organization = await new DirectoryService(c.env).createOrganization(
      session.actor,
      input,
    );
    return c.json({ organization }, 201);
  });

  // 8. Organizations update: org_admin or platform_owner
  routes.patch("/api/v1/admin/organizations/:id", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const input = await readJson(c, organizationSchema);
    if (input.status === "disabled") {
      await checkRateLimit(c.env, `admin-mass:${session.actor}`);
    }
    const organization = await new DirectoryService(c.env).updateOrganization(
      c.req.param("id"),
      session.actor,
      input,
      session.organizationId,
    );
    return c.json({ organization });
  });

  // 9. Groups list: org_viewer
  routes.get("/api/v1/admin/groups", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_viewer");
    return c.json({
      groups: await new AdminService(c.env).listGroups(session.organizationId),
    });
  });

  // 10. Groups create: org_admin
  routes.post("/api/v1/admin/groups", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const input = await readJson(c, groupSchema);
    const group = await new DirectoryService(c.env).createGroup(
      session.actor,
      input,
      session.organizationId,
    );
    return c.json({ group }, 201);
  });

  // 11. Groups update: org_admin
  routes.patch("/api/v1/admin/groups/:id", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const input = await readJson(c, groupSchema);
    const group = await new DirectoryService(c.env).updateGroup(
      c.req.param("id"),
      session.actor,
      input,
      session.organizationId,
    );
    return c.json({ group });
  });

  // 12. Managed users list: org_viewer
  routes.get("/api/v1/admin/managed-users", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_viewer");
    return c.json({
      managed_users: await new AdminService(c.env).listManagedUsers(
        session.organizationId,
      ),
    });
  });

  // 13. Managed users create: org_admin
  routes.post("/api/v1/admin/managed-users", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const input = await readJson(c, managedUserSchema);
    const managedUser = await new DirectoryService(c.env).createManagedUser(
      session.actor,
      input,
      session.organizationId,
    );
    return c.json({ managed_user: managedUser }, 201);
  });

  // 14. Managed users update: org_admin
  routes.patch("/api/v1/admin/managed-users/:id", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const input = await readJson(c, managedUserSchema);
    const managedUser = await new DirectoryService(c.env).updateManagedUser(
      c.req.param("id"),
      session.actor,
      input,
      session.organizationId,
    );
    return c.json({ managed_user: managedUser });
  });

  // 15. Support config get: org_viewer
  routes.get("/api/v1/admin/support-config", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_viewer");
    const orgId =
      session.organizationId ?? c.req.query("organization_id") ?? null;
    return c.json({
      support_config: await new SupportConfigService(c.env).getStored(orgId),
    });
  });

  // 16. Support config upsert: org_admin
  routes.put("/api/v1/admin/support-config", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const input = await readJson(c, supportConfigSchema);
    if (session.organizationId) {
      input.organization_id = session.organizationId;
    }
    const supportConfig = await new SupportConfigService(c.env).upsert(
      session.actor,
      input,
    );
    return c.json({ support_config: supportConfig });
  });

  // 17. Installations revoke: org_admin
  routes.post("/api/v1/admin/installations/:id/revoke", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const reason = await readReason(c);
    await new AdminService(c.env).revokeInstallation(
      c.req.param("id"),
      session.actor,
      reason.reason,
      session.organizationId,
    );
    return c.json({ revoked: true });
  });

  // 18. Installations update: org_admin
  routes.patch("/api/v1/admin/installations/:id", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const input = await readJson(c, installationPatchSchema);
    const installation = await new AdminService(c.env).updateInstallation(
      c.req.param("id"),
      session.actor,
      input,
      session.organizationId,
    );
    return c.json({ updated: true, installation });
  });

  // 19. Bulk deactivate installations: org_admin or platform_owner
  routes.post("/api/v1/admin/installations/bulk-deactivate", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const input = await readJson(c, bulkInstallationsSchema);
    await checkRateLimit(c.env, `admin-mass:${session.actor}`);
    const result = await new AdminService(c.env).bulkUpdateInstallations(
      session.actor,
      input,
      session.organizationId,
    );
    return c.json({ success: true, ...result });
  });

  // 20. Cycles renew: org_admin
  routes.post("/api/v1/admin/cycles/:id/renew", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const reason = await readReason(c);
    const result = await new AdminService(c.env).renewCycle(
      c.req.param("id"),
      session.actor,
      reason.reason,
      session.organizationId,
    );
    return c.json({ renewed: true, ...result });
  });

  // 21. Cycles adjust: org_admin
  routes.patch("/api/v1/admin/cycles/:id", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const input = await readJson(c, cyclePatchSchema);
    const result = await new AdminService(c.env).adjustCycle(
      c.req.param("id"),
      session.actor,
      input,
      session.organizationId,
    );
    return c.json({ updated: true, ...result });
  });

  // 22. Tickets update: org_admin
  routes.patch("/api/v1/admin/tickets/:id", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_admin");
    const input = await readJson(c, ticketPatchSchema);
    await new AdminService(c.env).updateTicket(
      c.req.param("id"),
      session.actor,
      input,
      session.organizationId,
    );
    return c.json({ updated: true });
  });

  // 23. Privacy export: platform_owner
  const handlePrivacyExport = async (c: any) => {
    await requireAdmin(c.req.raw, c.env, "platform_owner");
    const input = await readJson(c, privacyExportSchema);
    const result = await new PrivacyService(c.env).exportData(input);
    return c.json(result);
  };
  routes.post("/api/v1/admin/privacy/export", handlePrivacyExport);
  routes.post("/api/admin/privacy/export", handlePrivacyExport);

  // 24. Privacy erase: platform_owner
  const handlePrivacyErase = async (c: any) => {
    const session = await requireAdmin(c.req.raw, c.env, "platform_owner");
    const input = await readJson(c, privacyEraseSchema);
    const result = await new PrivacyService(c.env).eraseData(
      session.actor,
      input,
    );
    return c.json(result);
  };
  routes.post("/api/v1/admin/privacy/erase", handlePrivacyErase);
  routes.post("/api/admin/privacy/erase", handlePrivacyErase);

  return routes;
}
