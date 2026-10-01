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
  routes.get("/logout", (c) => c.redirect("/cdn-cgi/access/logout"));
  routes.get("/cdn-cgi/access/logout", (c) => {
    c.header(
      "Set-Cookie",
      "CF_Authorization=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
    );
    return c.html(
      `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sesión cerrada · AegisDesk</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #f8f9fc; color: #0a0e1c; }
    .card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 32px; max-width: 400px; text-align: center; box-shadow: 0 8px 24px rgba(16,42,77,.06); }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { color: #667085; margin: 0 0 20px; font-size: 14px; line-height: 1.5; }
    a { display: inline-flex; align-items: center; justify-content: center; padding: 10px 18px; background: #70ffaf; color: #073b29; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; }
    a:hover { background: #58ed9a; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sesión cerrada</h1>
    <p>Has cerrado sesión correctamente.</p>
    <a href="/panel">Iniciar sesión nuevamente</a>
  </div>
</body>
</html>`,
    );
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
