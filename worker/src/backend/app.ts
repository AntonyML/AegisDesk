import { Hono } from "hono";
import { registerErrorHandler } from "./errors";
import { createAdminRoutes } from "./routes/admin-routes";
import { createPanelRoutes } from "./routes/panel-routes";
import { createPublicRoutes } from "./routes/public-routes";
import { createShellRoutes } from "./routes/shell-routes";

export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  registerErrorHandler(app);
  app.route("/", createPublicRoutes());
  app.route("/", createShellRoutes());
  app.route("/", createAdminRoutes());
  app.route("/", createPanelRoutes());
  return app;
}
