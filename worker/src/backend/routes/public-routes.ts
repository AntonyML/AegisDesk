import { Hono } from "hono";
import { ticketPage } from "../../frontend/tickets/page";
import { readTicketBody } from "../http/body";
import { TicketService } from "../services/ticket-service";

export function createPublicRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();
  routes.get("/health", (c) =>
    c.json({ ok: true, service: "aegisdesk-worker" }),
  );
  routes.get("/", (c) => c.redirect("/tickets"));
  routes.get("/tickets", (c) => ticketPage(c.env));
  routes.get("/legal/terms", async (c) => {
    const { getTermsHtml } = await import("../legal/legal-pages");
    return c.html(getTermsHtml());
  });
  routes.get("/legal/privacy", async (c) => {
    const { getPrivacyHtml } = await import("../legal/legal-pages");
    return c.html(getPrivacyHtml());
  });
  routes.post("/api/v1/tickets", async (c) => {
    const input = await readTicketBody(c);
    const result = await new TicketService(c.env).create(
      input,
      c.req.header("cf-connecting-ip"),
      new URL(c.req.url).hostname,
    );
    return c.json(result, 202);
  });
  return routes;
}
