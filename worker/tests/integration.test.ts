import { env } from "cloudflare:workers";
import {
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importSPKI,
  jwtVerify,
} from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src";

async function testEnvironment(
  rateLimit?: Env["TICKET_RATE_LIMIT"],
): Promise<Env> {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
    extractable: true,
  });
  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);
  return {
    ...env,
    ENVIRONMENT: "test",
    STATE_PRIVATE_KEY: privatePem,
    STATE_KEY_ID: "test-key",
    STATE_ISSUER: "https://aegisdesk.test",
    CONTACT_NAME: "Soporte de prueba",
    TICKET_URL: "https://aegisdesk.test/tickets",
    NOTIFY_FROM: "aegisdesk@tonyml.com",
    NOTIFY_DESTINATION: "soporte@tonyml.com",
    TICKET_RATE_LIMIT: rateLimit,
    __testPublicKey: publicPem,
  } as unknown as Env;
}

async function jsonRequest(
  path: string,
  init: RequestInit = {},
  workerEnv: Env,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!headers.has("origin")) {
    headers.set("origin", "https://aegisdesk.test");
  }
  return app.fetch(
    new Request(`https://aegisdesk.test${path}`, { ...init, headers }),
    workerEnv,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AegisDesk Worker integrated seams", () => {
  it("enrolls once, persists a cycle, signs state and records events in D1", async () => {
    const workerEnv = await testEnvironment();
    const codeResponse = await jsonRequest(
      "/api/v1/admin/enrollment-codes",
      {
        method: "POST",
        headers: { "x-aegis-test-admin": "1" },
        body: "{}",
      },
      workerEnv,
    );
    expect(codeResponse.status).toBe(201);
    const codeBody = (await codeResponse.json()) as { code: string };

    const installResponse = await jsonRequest(
      "/api/v1/shell/enroll",
      {
        method: "POST",
        headers: {
          authorization: `Enrollment ${codeBody.code}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          protocol_version: 1,
          shell_version: "0.1.0-test",
          sidc_version: "legacy-test",
          equipment_name: "Equipo integración",
          sidc_target: "C:\\DEV\\SIDC\\SIDC_AegisSetup.exe",
        }),
      },
      workerEnv,
    );
    expect(installResponse.status).toBe(201);
    const installBody = (await installResponse.json()) as {
      install_id: string;
      installation_token: string;
    };

    const replayResponse = await jsonRequest(
      "/api/v1/shell/enroll",
      {
        method: "POST",
        headers: {
          authorization: `Enrollment ${codeBody.code}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          protocol_version: 1,
          shell_version: "0.1.0-test",
          sidc_version: "legacy-test",
          equipment_name: "Equipo integración",
          sidc_target: "C:\\DEV\\SIDC\\SIDC_AegisSetup.exe",
        }),
      },
      workerEnv,
    );
    expect(replayResponse.status).toBe(409);

    const openId = crypto.randomUUID();
    const stateResponse = await jsonRequest(
      "/api/v1/shell/state",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${installBody.installation_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          protocol_version: 1,
          install_id: installBody.install_id,
          open_id: openId,
          shell_version: "0.1.0-test",
          sidc_version: "legacy-test",
        }),
      },
      workerEnv,
    );
    expect(stateResponse.status).toBe(200);
    const stateBody = (await stateResponse.json()) as { state_token: string };
    const verified = await jwtVerify(
      stateBody.state_token,
      await importSPKI(
        (workerEnv as Env & { __testPublicKey: string }).__testPublicKey,
        "EdDSA",
      ),
      {
        issuer: "https://aegisdesk.test",
        audience: "aegisdesk-shell-v1",
        subject: installBody.install_id,
      },
    );
    expect(verified.payload.protocol_version).toBe(1);
    expect(verified.protectedHeader.kid).toBe("test-key");

    const eventResponse = await jsonRequest(
      "/api/v1/shell/events",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${installBody.installation_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          protocol_version: 1,
          open_id: openId,
          type: "launch_result",
          windows_user: "tester",
          shell_version: "0.1.0-test",
          sidc_version: "legacy-test",
          launch_result: "success",
        }),
      },
      workerEnv,
    );
    expect(eventResponse.status).toBe(202);

    const events = await workerEnv.DB.prepare(
      "SELECT type, windows_user FROM events WHERE installation_id = ? ORDER BY server_received_at",
    )
      .bind(installBody.install_id)
      .all<{ type: string; windows_user: string | null }>();
    expect(events.results.map((row) => row.type)).toEqual(
      expect.arrayContaining([
        "installation_enrolled",
        "opening",
        "launch_result",
      ]),
    );
    expect(
      events.results.find((row) => row.type === "launch_result")?.windows_user,
    ).toBeNull();
  });

  it("persists a ticket before best-effort email and is idempotent", async () => {
    const workerEnv = await testEnvironment();
    const ticketId = crypto.randomUUID();
    const payload = {
      name: "Persona de prueba",
      team: "Mesa de ayuda",
      category: "sidc",
      issue_code: "no_abre",
      turnstile_token: "local-test",
      idempotency_key: ticketId,
    };
    const first = await jsonRequest(
      "/api/v1/tickets",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      workerEnv,
    );
    const second = await jsonRequest(
      "/api/v1/tickets",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      workerEnv,
    );
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await first.json()).toMatchObject({
      ticket_id: ticketId,
      notified: false,
    });
    expect(await second.json()).toMatchObject({
      ticket_id: ticketId,
      notified: false,
    });
    const rows = await workerEnv.DB.prepare(
      "SELECT id FROM tickets WHERE id = ?",
    )
      .bind(ticketId)
      .all();
    expect(rows.results).toHaveLength(1);

    const resolved = await jsonRequest(
      `/api/v1/admin/tickets/${ticketId}`,
      {
        method: "PATCH",
        headers: {
          "x-aegis-test-admin": "1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "resolved", note: "Atendido." }),
      },
      workerEnv,
    );
    expect(resolved.status).toBe(200);
    const updatedTicket = await workerEnv.DB.prepare(
      "SELECT status FROM tickets WHERE id = ?",
    )
      .bind(ticketId)
      .first<{ status: string }>();
    expect(updatedTicket?.status).toBe("resolved");
  });

  it("honors the optional ticket rate-limit binding", async () => {
    const workerEnv = await testEnvironment({
      limit: async () => ({ success: false }),
    });
    const response = await jsonRequest(
      "/api/v1/tickets",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Persona de prueba",
          team: "Mesa de ayuda",
          category: "sidc",
          issue_code: "no_abre",
          turnstile_token: "local-test",
          idempotency_key: crypto.randomUUID(),
        }),
      },
      workerEnv,
    );
    expect(response.status).toBe(429);
  });

  it("requires the Turnstile action and hostname and rejects a replay", async () => {
    const workerEnv = await testEnvironment();
    workerEnv.ENVIRONMENT = "production";
    workerEnv.TURNSTILE_SECRET = "test-turnstile-secret";
    let verificationCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      verificationCalls += 1;
      const result =
        verificationCalls === 1
          ? { success: true, action: "other", hostname: "aegisdesk.test" }
          : verificationCalls === 2
            ? { success: true, action: "ticket", hostname: "aegisdesk.test" }
            : { success: false, "error-codes": ["timeout-or-duplicate"] };
      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
      });
    });

    const invalidAction = await jsonRequest(
      "/api/v1/tickets",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Persona de prueba",
          team: "Mesa de ayuda",
          category: "sidc",
          issue_code: "no_abre",
          turnstile_token: "token-action-invalida",
          idempotency_key: crypto.randomUUID(),
        }),
      },
      workerEnv,
    );
    expect(invalidAction.status).toBe(400);

    const payload = {
      name: "Persona de prueba",
      team: "Mesa de ayuda",
      category: "sidc",
      issue_code: "no_abre",
      turnstile_token: "token-valido",
      idempotency_key: crypto.randomUUID(),
    };
    const accepted = await jsonRequest(
      "/api/v1/tickets",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      workerEnv,
    );
    expect(accepted.status).toBe(202);

    const replay = await jsonRequest(
      "/api/v1/tickets",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      workerEnv,
    );
    expect(replay.status).toBe(400);
    expect(verificationCalls).toBe(3);
  });

  it("serves the public form and Access-protected panel", async () => {
    const workerEnv = await testEnvironment();
    const publicPage = await jsonRequest("/tickets", {}, workerEnv);
    expect(publicPage.status).toBe(200);
    const publicHtml = await publicPage.text();
    expect(publicHtml).toContain("Soporte Aegis");
    expect(publicHtml).not.toContain("Soporte SIDC");
    expect(publicHtml).toContain('id="ticket-toast"');
    expect(publicHtml).toContain("Ticket enviado correctamente");
    expect(publicHtml).toContain("turnstile.reset");
    expect(publicHtml).not.toContain("Ticket registrado:");

    const panel = await jsonRequest(
      "/panel",
      { headers: { "x-aegis-test-admin": "1" } },
      workerEnv,
    );
    expect(panel.status).toBe(200);
    const panelHtml = await panel.text();
    expect(panelHtml).toContain("Panel de soporte");
    expect(panelHtml).toContain("Telemetría reciente");
    expect(panelHtml).toContain('id="logout-button"');
  });

  it("serves the logout route and renders confirmation page", async () => {
    const workerEnv = await testEnvironment();
    const logoutRes = await jsonRequest("/logout", {}, workerEnv);
    expect(logoutRes.status).toBe(200);
    const logoutHtml = await logoutRes.text();
    expect(logoutHtml).toContain("Sesión cerrada");
    expect(logoutRes.headers.get("set-cookie")).toContain("CF_Authorization=;");

    const accessLogout = await jsonRequest(
      "/cdn-cgi/access/logout?returnTo=/logout",
      {},
      workerEnv,
    );
    expect(accessLogout.status).toBe(302);
    expect(accessLogout.headers.get("location")).toBe("/logout");
  });

  it("handles unauthenticated or unauthorized panel access with redirect or HTML page instead of raw JSON", async () => {
    const workerEnv = await testEnvironment();

    // 1. Without credentials and with ACCESS_TEAM_DOMAIN configured -> redirects to login
    const envWithAccess = {
      ...workerEnv,
      ACCESS_TEAM_DOMAIN: "https://testteam.cloudflareaccess.com",
      ACCESS_AUDIENCE: "test-aud",
    } as unknown as Env;
    const unauthRes = await jsonRequest("/panel", {}, envWithAccess);
    expect(unauthRes.status).toBe(302);
    expect(unauthRes.headers.get("location")).toBe(
      "https://testteam.cloudflareaccess.com",
    );

    // 2. With authenticated email but not in memberships -> renders access denied HTML (403)
    const deniedRes = await jsonRequest(
      "/panel",
      {
        headers: {
          "x-aegis-test-admin": "1",
          "x-aegis-test-email": "random-user@test.com",
        },
      },
      workerEnv,
    );
    expect(deniedRes.status).toBe(403);
    const deniedHtml = await deniedRes.text();
    expect(deniedHtml).toContain("Acceso denegado");
    expect(deniedHtml).toContain("random-user@test.com");
    expect(deniedHtml).toContain("/cdn-cgi/access/logout");
    expect(deniedHtml).toContain("Cerrar sesión / Iniciar con otra cuenta");
  });
});
