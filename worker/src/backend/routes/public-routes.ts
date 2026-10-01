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
  routes.get("/logout", (c) => {
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
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 8px 24px rgba(16,42,77,.06);
    }
    .icon {
      display: inline-grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #ecfdf5;
      color: #059669;
      font-size: 22px;
      font-weight: 700;
      margin: 0 auto 16px;
    }
    h1 { font-size: 22px; margin: 0 0 8px; letter-spacing: -.02em; }
    p { color: #667085; margin: 0 0 24px; font-size: 14px; line-height: 1.5; }
    .actions { display: flex; flex-direction: column; gap: 10px; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 18px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
      transition: background .15s;
    }
    .btn-primary { background: #70ffaf; color: #073b29; border: 1px solid #42dc8a; }
    .btn-primary:hover { background: #58ed9a; }
    .btn-secondary { background: #ffffff; color: #344054; border: 1px solid #cbd2dc; }
    .btn-secondary:hover { background: #f5f6f8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Sesión cerrada</h1>
    <p>Has cerrado sesión exitosamente de AegisDesk.</p>
    <div class="actions">
      <a href="/panel" class="btn btn-primary">Iniciar sesión nuevamente</a>
      <a href="/tickets" class="btn btn-secondary">Ir a solicitudes de soporte</a>
    </div>
  </div>
</body>
</html>`,
    );
  });
  routes.get("/cdn-cgi/access/logout", (c) => {
    c.header(
      "Set-Cookie",
      "CF_Authorization=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
    );
    const returnTo = c.req.query("returnTo");
    if (returnTo) {
      if (returnTo.startsWith("/")) return c.redirect(returnTo);
      try {
        const parsed = new URL(returnTo);
        const host = new URL(c.req.url).host;
        if (parsed.host === host) return c.redirect(returnTo);
      } catch {
        // Fall through
      }
    }
    return c.redirect("/logout");
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
