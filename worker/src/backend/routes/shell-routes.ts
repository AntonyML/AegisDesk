import { Hono } from "hono";
import { RequestError } from "../errors";
import { readJson } from "../http/body";
import { enrollmentSchema, eventSchema, stateSchema } from "../http/validation";
import { enrollmentCode } from "../security/headers";
import { InstallationAuthenticator } from "../security/installation-auth";
import { EnrollmentService } from "../services/enrollment-service";
import { ShellService } from "../services/shell-service";

export function createShellRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();
  routes.post("/api/v1/shell/enroll", async (c) => {
    const code = enrollmentCode(c.req.raw);
    if (!code) throw new RequestError("enrollment_required", 401);
    const input = await readJson(c, enrollmentSchema);
    const result = await new EnrollmentService(c.env).enroll(
      code,
      input,
      new URL(c.req.url).origin,
    );
    return c.json(result, 201);
  });

  routes.post("/api/v1/shell/state", async (c) => {
    const installation = await new InstallationAuthenticator(
      c.env,
    ).authenticate(c.req.raw);
    const input = await readJson(c, stateSchema);
    if (input.install_id !== installation.id) {
      throw new RequestError("installation_mismatch", 403);
    }
    return c.json(await new ShellService(c.env).state(installation, input));
  });

  routes.post("/api/v1/shell/events", async (c) => {
    const installation = await new InstallationAuthenticator(
      c.env,
    ).authenticate(c.req.raw);
    const input = await readJson(c, eventSchema);
    await new ShellService(c.env).recordEvent(installation, input);
    return c.json({ accepted: true }, 202);
  });
  return routes;
}
