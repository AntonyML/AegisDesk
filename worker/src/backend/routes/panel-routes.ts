import { Hono } from "hono";
import { panelPage } from "../../frontend/panel/page";
import { requireAdmin } from "../security/admin-auth";
import { AdminService } from "../services/admin-service";
import { SupportConfigService } from "../services/support-config-service";

export function createPanelRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();
  routes.get("/panel", async (c) => {
    const session = await requireAdmin(c.req.raw, c.env, "org_viewer");
    const service = new AdminService(c.env);
    const [
      installations,
      events,
      tickets,
      organizations,
      groups,
      managedUsers,
      support,
    ] = await Promise.all([
      service.listInstallations(session.organizationId),
      service.listEvents(session.organizationId),
      service.listTickets(session.organizationId),
      service.listOrganizations(session.organizationId),
      service.listGroups(session.organizationId),
      service.listManagedUsers(session.organizationId),
      new SupportConfigService(c.env).getForOrganization(
        session.organizationId,
      ),
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
          organizationId: item.organization?.id ?? null,
          organizationName: item.organization?.name ?? null,
          groupId: item.group?.id ?? null,
          groupName: item.group?.name ?? null,
          assignedUserId: item.assignedUser?.id ?? null,
          assignedUserName: item.assignedUser?.displayName ?? null,
          sidcTarget: item.sidcTarget,
          latestTermsVersion: item.latestTermsVersion ?? null,
          termsPending: item.termsPending ?? true,
        })),
        tickets,
        events,
        {
          organizations,
          groups,
          managedUsers,
          support,
        },
        session.role,
      ),
    );
  });
  return routes;
}
