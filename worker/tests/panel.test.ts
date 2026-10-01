import { describe, expect, it } from "vitest";
import { panelPage } from "../src/frontend/panel/page";

describe("panel page", () => {
  it("embeds an executable ticket status script", async () => {
    const page = await panelPage(
      [],
      [
        {
          id: "ticket-1",
          createdAt: "2026-09-28T19:00:00Z",
          name: "Persona de prueba",
          team: "Mesa de ayuda",
          description: "No abre SIDC.",
          status: "open",
          notified: false,
        },
      ],
      [],
    );
    const scriptStart = page.indexOf("<script>");
    const scriptEnd = page.indexOf("</script>", scriptStart);
    const script =
      scriptStart >= 0 && scriptEnd >= 0
        ? page.slice(scriptStart + "<script>".length, scriptEnd)
        : undefined;

    expect(script).toBeDefined();
    expect(script).toContain("data-ticket");
    expect(script).toContain("=>");
    expect(() => new Function(script as string)).not.toThrow();
  });

  it("keeps KPI hierarchy and exposes administrable equipment fields", async () => {
    const page = await panelPage(
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          equipmentName: "KernelOS-PC",
          shellVersion: "0.2.3",
          sidcVersion: "unknown",
          lastOpenedAt: "2026-09-28T19:00:00Z",
          status: "active",
          cycleId: "22222222-2222-4222-8222-222222222222",
          dueAt: "2027-01-28T20:39:00Z",
          organizationId: null,
          organizationName: null,
          groupId: null,
          groupName: null,
          assignedUserId: null,
          assignedUserName: null,
          sidcTarget: "C:\\SIDC\\SIDC.exe",
        },
      ],
      [],
      [],
      {
        organizations: [],
        groups: [],
        managedUsers: [],
      },
    );

    const markup = String(page);
    expect(markup).toContain('class="kpi-label">Equipos activos</span>');
    expect(markup).toContain('class="kpi-value">1</strong>');
    expect(markup).toContain(
      'class="kpi-help">Instalaciones operativas</span>',
    );
    expect(markup).toContain("Ver / administrar");
    expect(markup).toContain('id="equipment-status"');
    expect(markup).toContain('id="equipment-expires"');
    expect(markup).toContain('id="administration"');
  });

  it("renders a logout button in navigation pointing to access logout", async () => {
    const page = await panelPage([], [], [], {
      organizations: [],
      groups: [],
      managedUsers: [],
    });
    const markup = String(page);
    expect(markup).toContain('id="logout-button"');
    expect(markup).toContain('href="/cdn-cgi/access/logout"');
    expect(markup).toContain("Cerrar sesión");
  });
});
