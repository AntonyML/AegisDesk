import { describe, expect, it } from "vitest";
import { panelPage } from "../src/panel";

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
});
