import { Hono } from "hono";
import { RequestError } from "../errors";
import { readJson } from "../http/body";
import {
  enrollmentSchema,
  eventSchema,
  stateSchema,
  termsAcceptanceSchema,
} from "../http/validation";
import { enrollmentCode } from "../security/headers";
import { InstallationAuthenticator } from "../security/installation-auth";
import { checkRateLimit } from "../security/rate-limit";
import { EnrollmentService } from "../services/enrollment-service";
import { ShellService } from "../services/shell-service";

export function createShellRoutes(): Hono<{ Bindings: Env }> {
  const routes = new Hono<{ Bindings: Env }>();
  routes.post("/api/v1/shell/enroll", async (c) => {
    const remoteIp = c.req.header("cf-connecting-ip") ?? "unknown";
    await checkRateLimit(c.env, `enroll:${remoteIp}`, {
      limit: 10,
      windowSeconds: 60,
    });
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

  routes.get("/api/v1/shell/config", async (c) => {
    const installation = await new InstallationAuthenticator(
      c.env,
    ).authenticate(c.req.raw);
    const result = await new ShellService(c.env).configToken(installation);
    const etag = `"${result.config.revision}"`;
    const headers = new Headers({
      "cache-control": "no-cache",
      etag,
      "content-type": "application/json; charset=UTF-8",
    });
    const requestTag = c.req.header("if-none-match");
    if (requestTag === etag || requestTag === `W/${etag}`) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(JSON.stringify(result), { headers });
  });

  routes.post("/api/v1/shell/events", async (c) => {
    const installation = await new InstallationAuthenticator(
      c.env,
    ).authenticate(c.req.raw);
    const input = await readJson(c, eventSchema);
    await new ShellService(c.env).recordEvent(installation, input);
    return c.json({ accepted: true }, 202);
  });

  const handleTermsAcceptance = async (c: any) => {
    const installation = await new InstallationAuthenticator(
      c.env,
    ).authenticate(c.req.raw);
    const input = await readJson(c, termsAcceptanceSchema);
    await new ShellService(c.env).recordTermsAcceptance(installation, input);
    return new Response(null, { status: 204 });
  };

  routes.post("/api/shell/terms-acceptance", handleTermsAcceptance);
  routes.post("/api/v1/shell/terms-acceptance", handleTermsAcceptance);

  return routes;
}
