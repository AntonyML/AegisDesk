import { Hono } from "hono";
import { readJson, readReason } from "../http/body";
import { cyclePatchSchema, ticketPatchSchema } from "../http/validation";
import { requireAdmin } from "../security/admin-auth";
import { AdminService } from "../services/admin-service";
import { EnrollmentService } from "../services/enrollment-service";

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
