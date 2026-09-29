import { env } from "cloudflare:workers";
import {
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importSPKI,
  jwtVerify,
} from "jose";
import { describe, expect, it } from "vitest";
import { app } from "../src";

async function testEnvironment(): Promise<Env> {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
    extractable: true,
  });
  return {
    ...env,
    ENVIRONMENT: "test",
    STATE_PRIVATE_KEY: await exportPKCS8(privateKey),
    STATE_KEY_ID: "test-key",
    STATE_ISSUER: "https://aegisdesk.test",
    CONTACT_NAME: "Soporte de prueba",
    TICKET_URL: "https://aegisdesk.test/tickets",
    __testPublicKey: await exportSPKI(publicKey),
  } as unknown as Env;
}

async function jsonRequest(
  path: string,
  workerEnv: Env,
  init: RequestInit = {},
): Promise<Response> {
  return app.fetch(
    new Request(`https://aegisdesk.test${path}`, init),
    workerEnv,
  );
}

function adminInit(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      "x-aegis-test-admin": "1",
      ...(init.headers ?? {}),
    },
  };
}

async function createInstallation(workerEnv: Env) {
  const codeResponse = await jsonRequest(
    "/api/v1/admin/enrollment-codes",
    workerEnv,
    adminInit({ method: "POST", body: "{}" }),
  );
  const { code } = (await codeResponse.json()) as { code: string };
  const response = await jsonRequest("/api/v1/shell/enroll", workerEnv, {
    method: "POST",
    headers: {
      authorization: `Enrollment ${code}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      protocol_version: 1,
      shell_version: "0.2.0-test",
      sidc_version: "legacy-test",
      equipment_name: `Equipo ${crypto.randomUUID()}`,
      sidc_target: "C:\\SIDC\\SIDC.exe",
    }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as {
    install_id: string;
    installation_token: string;
  };
}

describe("remote administration contract", () => {
  it("creates the directory, assigns a device and rejects inconsistent assignments", async () => {
    const workerEnv = await testEnvironment();
    const create = async (path: string, body: unknown) =>
      jsonRequest(
        path,
        workerEnv,
        adminInit({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );

    const organizationResponse = await create("/api/v1/admin/organizations", {
      name: `FEMUCARIBE ${crypto.randomUUID()}`,
    });
    expect(organizationResponse.status).toBe(201);
    const organization = (await organizationResponse.json()) as {
      organization: { id: string };
    };
    const groupResponse = await create("/api/v1/admin/groups", {
      name: "Administración",
      organization_id: organization.organization.id,
    });
    expect(groupResponse.status).toBe(201);
    const group = (await groupResponse.json()) as { group: { id: string } };
    const userResponse = await create("/api/v1/admin/managed-users", {
      display_name: "Rocío Vargas",
      email: "rocio@example.test",
      organization_id: organization.organization.id,
      group_id: group.group.id,
    });
    expect(userResponse.status).toBe(201);
    const user = (await userResponse.json()) as {
      managed_user: { id: string };
    };
    const installation = await createInstallation(workerEnv);

    const assigned = await jsonRequest(
      `/api/v1/admin/installations/${installation.install_id}`,
      workerEnv,
      adminInit({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_id: organization.organization.id,
          group_id: group.group.id,
          assigned_user_id: user.managed_user.id,
          reason: "Asignación inicial",
        }),
      }),
    );
    expect(assigned.status).toBe(200);

    const otherOrganizationResponse = await create(
      "/api/v1/admin/organizations",
      { name: `Otra empresa ${crypto.randomUUID()}` },
    );
    const otherOrganization = (await otherOrganizationResponse.json()) as {
      organization: { id: string };
    };
    const incoherent = await jsonRequest(
      `/api/v1/admin/installations/${installation.install_id}`,
      workerEnv,
      adminInit({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_id: otherOrganization.organization.id,
          group_id: group.group.id,
          assigned_user_id: user.managed_user.id,
          reason: "Debe ser rechazado",
        }),
      }),
    );
    expect(incoherent.status).toBe(409);
  });

  it("publishes active/disabled state, manual cycle dates, support config and ETag", async () => {
    const workerEnv = await testEnvironment();
    const installation = await createInstallation(workerEnv);
    const dueAt = "2030-01-02T15:04:05.000Z";

    const disabled = await jsonRequest(
      `/api/v1/admin/installations/${installation.install_id}`,
      workerEnv,
      adminInit({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "disabled",
          reason: "Prueba de bloqueo",
        }),
      }),
    );
    expect(disabled.status).toBe(200);

    const installationRow = await workerEnv.DB.prepare(
      "SELECT id FROM cycles WHERE installation_id = ? AND status = 'active'",
    )
      .bind(installation.install_id)
      .first<{ id: string }>();
    expect(installationRow?.id).toBeTruthy();
    const cycle = await jsonRequest(
      `/api/v1/admin/cycles/${installationRow?.id}`,
      workerEnv,
      adminInit({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ due_at: dueAt, reason: "Prueba manual" }),
      }),
    );
    expect(cycle.status).toBe(200);

    const support = await jsonRequest(
      "/api/v1/admin/support-config",
      workerEnv,
      adminInit({
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Soporte FEMUCARIBE",
          message: "Contactá a soporte para continuar.",
          notice: "Horario especial esta semana.",
          area_name: "Mesa de ayuda",
          hours: "Lunes a viernes, 8:00 a 17:00",
          contact_email: "soporte@example.test",
          contact_phone: "+506 2222 3333",
          ticket_url: "https://aegisdesk.test/tickets",
          docs_url: "https://aegisdesk.test/docs",
        }),
      }),
    );
    expect(support.status).toBe(200);

    const config = await jsonRequest("/api/v1/shell/config", workerEnv, {
      headers: {
        authorization: `Bearer ${installation.installation_token}`,
      },
    });
    expect(config.status).toBe(200);
    const etag = config.headers.get("etag");
    const configBody = (await config.json()) as {
      config: {
        installation: { status: string; cycle_expires_at: string };
        support: {
          title: string;
          contacts: Array<{ value: string }>;
          links: Array<{ url: string }>;
        };
      };
      config_token: string;
    };
    expect(etag).toBeTruthy();
    expect(configBody.config.installation.status).toBe("disabled");
    expect(configBody.config.installation.cycle_expires_at).toBe(dueAt);
    expect(configBody.config.support.title).toBe("Soporte FEMUCARIBE");
    expect(
      configBody.config.support.contacts.map((item) => item.value),
    ).toEqual(
      expect.arrayContaining([
        "mailto:soporte@example.test",
        "tel:+506 2222 3333",
      ]),
    );
    expect(configBody.config.support.links.map((item) => item.url)).toEqual(
      expect.arrayContaining([
        "https://aegisdesk.test/tickets",
        "https://aegisdesk.test/docs",
      ]),
    );

    const notModified = await jsonRequest("/api/v1/shell/config", workerEnv, {
      headers: {
        authorization: `Bearer ${installation.installation_token}`,
        "if-none-match": etag as string,
      },
    });
    expect(notModified.status).toBe(304);

    const state = await jsonRequest("/api/v1/shell/state", workerEnv, {
      method: "POST",
      headers: {
        authorization: `Bearer ${installation.installation_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        protocol_version: 1,
        install_id: installation.install_id,
        open_id: crypto.randomUUID(),
        shell_version: "0.2.0-test",
        sidc_version: "legacy-test",
      }),
    });
    expect(state.status).toBe(200);
    const stateBody = (await state.json()) as { state_token: string };
    const verified = await jwtVerify(
      stateBody.state_token,
      await importSPKI(
        (workerEnv as Env & { __testPublicKey: string }).__testPublicKey,
        "EdDSA",
      ),
      {
        issuer: "https://aegisdesk.test",
        audience: "aegisdesk-shell-v1",
        subject: installation.install_id,
      },
    );
    expect(
      (verified.payload.config as { installation: { status: string } })
        .installation.status,
    ).toBe("disabled");

    const afterTelemetry = await jsonRequest(
      "/api/v1/shell/config",
      workerEnv,
      {
        headers: {
          authorization: `Bearer ${installation.installation_token}`,
          "if-none-match": etag as string,
        },
      },
    );
    expect(afterTelemetry.status).toBe(304);

    const active = await jsonRequest(
      `/api/v1/admin/installations/${installation.install_id}`,
      workerEnv,
      adminInit({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "active", reason: "Prueba reactivada" }),
      }),
    );
    expect(active.status).toBe(200);
    const activeConfig = await jsonRequest("/api/v1/shell/config", workerEnv, {
      headers: { authorization: `Bearer ${installation.installation_token}` },
    });
    expect(activeConfig.status).toBe(200);
    const activeBody = (await activeConfig.json()) as {
      config: { installation: { status: string } };
    };
    expect(activeBody.config.installation.status).toBe("active");
  });
});
