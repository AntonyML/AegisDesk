import { Hono } from "hono";
import { panelPage } from "../../frontend/panel/page";
import { requireAdmin } from "../security/admin-auth";
import { AdminService } from "../services/admin-service";

export function createPanelRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();
  routes.get("/panel", async (c) => {
    await requireAdmin(c.req.raw, c.env);
    const service = new AdminService(c.env);
    const [installations, events, tickets] = await Promise.all([
      service.listInstallations(),
      service.listEvents(),
      service.listTickets(),
    ]);
    return c.html(
      await panelPage(
        installations.map((item) => ({
          id: item.id,
          equipmentName: item.equipmentName,
          shellVersion: item.shellVersion,
          sidcVersion: item.sidcVersion,
          lastOpenedAt: item.lastOpenedAt,
          status: item.status,
          cycleId: item.cycle?.id ?? null,
          dueAt: item.cycle?.dueAt ?? null,
        })),
        tickets,
        events,
      ),
    );
  });
  return routes;
}
