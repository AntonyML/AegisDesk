import { Hono } from "hono";
import { panelPage } from "../../frontend/panel/page";
import { escapeHtml } from "../../frontend/shared/html";
import {
  type AdminSession,
  AuthError,
  requireAdmin,
} from "../security/admin-auth";
import { AdminService } from "../services/admin-service";
import { SupportConfigService } from "../services/support-config-service";

function accessDeniedPage(email?: string): string {
  const displayEmail = email ? escapeHtml(email) : "";
  const emailNotice = displayEmail
    ? `<p>La cuenta <span class="email-highlight">${displayEmail}</span> no tiene permisos asignados en el panel de AegisDesk.</p>`
    : "<p>Tu cuenta no tiene permisos asignados en el panel de AegisDesk.</p>";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Acceso no autorizado · AegisDesk</title>
  <style>
    :root {
      font-family: Inter, system-ui, -apple-system, sans-serif;
      background: #f8f9fc;
      color: #0a0e1c;
    }
    body {
      display: grid;
      place-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 36px 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 8px 24px rgba(16,42,77,.06);
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background: #fee2e2;
      color: #b42318;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .05em;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 10px;
      letter-spacing: -.02em;
    }
    p {
      color: #667085;
      font-size: 14px;
      line-height: 1.55;
      margin: 0 0 24px;
    }
    .email-highlight {
      display: inline-block;
      background: #f1f3f7;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      color: #1d2939;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 16px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
    }
    .btn-primary {
      background: #70ffaf;
      color: #073b29;
      border: 1px solid #42dc8a;
    }
    .btn-primary:hover {
      background: #58ed9a;
    }
    .btn-secondary {
      background: #ffffff;
      color: #344054;
      border: 1px solid #cbd2dc;
    }
    .btn-secondary:hover {
      background: #f5f6f8;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Acceso restringido</span>
    <h1>Acceso denegado</h1>
    ${emailNotice}
    <div class="actions">
      <a href="/cdn-cgi/access/logout" class="btn btn-primary">Cerrar sesión / Iniciar con otra cuenta</a>
      <a href="/tickets" class="btn btn-secondary">Ir a solicitudes de soporte</a>
    </div>
  </div>
</body>
</html>`;
}

export function createPanelRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();
  routes.get("/panel", async (c) => {
    let session: AdminSession;
    try {
      session = await requireAdmin(c.req.raw, c.env, "org_viewer");
    } catch (error) {
      if (error instanceof AuthError) {
        if (
          (error.code === "admin_auth_required" ||
            error.code === "admin_auth_invalid") &&
          c.env.ACCESS_TEAM_DOMAIN
        ) {
          return c.redirect(c.env.ACCESS_TEAM_DOMAIN);
        }
        const deniedEmail = (error.details?.email as string) || "";
        return c.html(accessDeniedPage(deniedEmail), error.status as 403 | 401);
      }
      throw error;
    }
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
