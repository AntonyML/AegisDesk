import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { app } from "../src";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    ENVIRONMENT: "test",
    APP_URL: "https://aegisdesk.test",
    ...overrides,
  } as unknown as Env;
}

const validPayload = {
  name: "Juan Perez",
  team: "Soporte",
  category: "sidc",
  issue_code: "mensaje_error",
  turnstile_token: "valid-token",
  idempotency_key: "60000000-0000-4000-8000-000000000001",
};

describe("support ticket validation and allowlisted issue summaries", () => {
  it("returns HTTP 422 with { code: 'TOO_LONG', field } for each field exceeding limit", async () => {
    const workerEnv = makeEnv();

    const cases = [
      { field: "name", payload: { ...validPayload, name: "A".repeat(129) } },
      { field: "team", payload: { ...validPayload, team: "B".repeat(129) } },
      {
        field: "category",
        payload: { ...validPayload, category: "A".repeat(33) },
      },
      {
        field: "issue_code",
        payload: { ...validPayload, issue_code: "I".repeat(65) },
      },
      {
        field: "turnstile_token",
        payload: { ...validPayload, turnstile_token: "T".repeat(2049) },
      },
      {
        field: "idempotency_key",
        payload: { ...validPayload, idempotency_key: "K".repeat(129) },
      },
    ];

    for (const { field, payload } of cases) {
      const res = await app.fetch(
        new Request("https://aegisdesk.test/api/v1/tickets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
        workerEnv,
      );
      expect(res.status).toBe(422);
      const json = (await res.json()) as any;
      expect(json.code).toBe("TOO_LONG");
      expect(json.field).toBe(field);
    }
  });

  it("returns HTTP 422 with { code: 'INVALID', field } for missing, empty, or control characters", async () => {
    const workerEnv = makeEnv();

    const cases = [
      // Missing or invalid name
      { field: "name", payload: { ...validPayload, name: "" } },
      { field: "name", payload: { ...validPayload, name: "   " } },
      { field: "name", payload: { ...validPayload, name: "Juan\x00Perez" } },
      // Missing or invalid team
      { field: "team", payload: { ...validPayload, team: "" } },
      { field: "team", payload: { ...validPayload, team: "Soporte\x07Noc" } },
      // Missing or invalid predefined ticket choices
      { field: "category", payload: { ...validPayload, category: "" } },
      { field: "category", payload: { ...validPayload, category: "unknown" } },
      {
        field: "issue_code",
        payload: { ...validPayload, issue_code: "unknown" },
      },
      // Missing or invalid turnstile_token
      {
        field: "turnstile_token",
        payload: { ...validPayload, turnstile_token: "" },
      },
      {
        field: "turnstile_token",
        payload: { ...validPayload, turnstile_token: "token\x1f" },
      },
      // Missing or invalid idempotency_key
      {
        field: "idempotency_key",
        payload: { ...validPayload, idempotency_key: "" },
      },
      {
        field: "idempotency_key",
        payload: { ...validPayload, idempotency_key: "not-a-valid-uuid" },
      },
    ];

    for (const { field, payload } of cases) {
      const res = await app.fetch(
        new Request("https://aegisdesk.test/api/v1/tickets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
        workerEnv,
      );
      expect(res.status).toBe(422);
      const json = (await res.json()) as any;
      expect(json.code).toBe("INVALID");
      expect(json.field).toBe(field);
    }

    // Malformed JSON body
    const badJsonRes = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "invalid-json{",
      }),
      workerEnv,
    );
    expect(badJsonRes.status).toBe(422);
    const badJson = (await badJsonRes.json()) as any;
    expect(badJson.code).toBe("INVALID");
    expect(badJson.field).toBe("body");
  });

  it("rejects free-text descriptions without storing or echoing the submitted content", async () => {
    const workerEnv = makeEnv();
    const sensitiveText =
      "Mi contraseña secreta es password: SuperSecretPassword123!";

    const res = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...validPayload,
          description: sensitiveText,
        }),
      }),
      workerEnv,
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.code).toBe("INVALID");
    expect(body.field).toBe("body");
    expect(JSON.stringify(body)).not.toContain("SuperSecretPassword123!");
  });

  it("stores only the canonical summary for a valid category and issue selection", async () => {
    const workerEnv = makeEnv();

    const response = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...validPayload,
          idempotency_key: "60000000-0000-4000-8000-000000000099",
        }),
      }),
      workerEnv,
    );
    expect(response.status).toBe(202);

    const row = await workerEnv.DB.prepare(
      "SELECT description FROM tickets WHERE id = ?",
    )
      .bind("60000000-0000-4000-8000-000000000099")
      .first<{ description: string }>();
    expect(row?.description).toBe(
      "Área: SIDC; problema: Muestra un mensaje de error",
    );
  });

  it("sends only the selected issue summary to Resend and stores the same summary in D1", async () => {
    let sentEmailPayload: any = null;
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = typeof url === "string" ? url : url.toString();
          if (urlStr.includes("api.resend.com/emails")) {
            sentEmailPayload = JSON.parse(init?.body as string);
            return new Response(JSON.stringify({ id: "email-123" }), {
              status: 200,
            });
          }
          return new Response(null, { status: 404 });
        },
      );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    try {
      const workerEnv = makeEnv({
        RESEND_API_KEY: "re_test_123",
        NOTIFY_FROM: "tickets@aegisdesk.test",
        NOTIFY_DESTINATION: "admin@aegisdesk.test",
      });

      const ticketId = "60000000-0000-4000-8000-000000000005";

      const res = await app.fetch(
        new Request("https://aegisdesk.test/api/v1/tickets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Carlos Gomez",
            team: "Desarrollo",
            category: "sidc",
            issue_code: "mensaje_error",
            turnstile_token: "test-token",
            idempotency_key: ticketId,
          }),
        }),
        workerEnv,
      );

      expect(res.status).toBe(202);

      // Verify email was sent and minimized
      expect(sentEmailPayload).toBeDefined();
      expect(sentEmailPayload.from).toBe("tickets@aegisdesk.test");
      expect(sentEmailPayload.to).toEqual(["admin@aegisdesk.test"]);
      expect(sentEmailPayload.text).toContain(ticketId);
      expect(sentEmailPayload.text).toContain("Nombre: Carlos Gomez");
      expect(sentEmailPayload.text).toContain("Equipo: Desarrollo");
      expect(sentEmailPayload.text).toContain(
        "Área: SIDC; problema: Muestra un mensaje de error",
      );
      expect(sentEmailPayload.text).not.toContain("Este es un reporte");

      // Verify D1 contains only the canonical summary from the allowlist
      const d1Row = await workerEnv.DB.prepare(
        "SELECT * FROM tickets WHERE id = ?",
      )
        .bind(ticketId)
        .first<{ description: string }>();
      expect(d1Row?.description).toBe(
        "Área: SIDC; problema: Muestra un mensaje de error",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("serves accessible ticket UI with fixed choices, privacy notice, aria attributes, and proper escaping", async () => {
    const maliciousSiteKey = 'site-key"><script>alert(1)</script>';
    const workerEnv = makeEnv({
      PUBLIC_TURNSTILE_SITE_KEY:
        maliciousSiteKey as unknown as Env["PUBLIC_TURNSTILE_SITE_KEY"],
    });

    const res = await app.fetch(
      new Request("https://aegisdesk.test/tickets"),
      workerEnv,
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    // 1. Accessible labels and error containers with aria-live
    expect(html).toContain('for="field-name"');
    expect(html).toContain('id="field-name"');
    expect(html).toContain(
      'id="error-name" class="field-error" role="alert" aria-live="polite"',
    );

    expect(html).toContain('for="field-team"');
    expect(html).toContain('id="field-team"');
    expect(html).toContain(
      'id="error-team" class="field-error" role="alert" aria-live="polite"',
    );

    expect(html).toContain('for="field-category"');
    expect(html).toContain('id="field-category"');
    expect(html).toContain(
      'id="error-category" class="field-error" role="alert" aria-live="polite"',
    );
    expect(html).toContain('for="field-issue_code"');
    expect(html).toContain('id="field-issue_code"');
    expect(html).toContain(
      'id="error-issue_code" class="field-error" role="alert" aria-live="polite"',
    );
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('name="description"');
    expect(html).toContain('value="equipo_red"');
    expect(html).toContain("data-catalog=");

    // 2. Privacy notice before submit button
    const privacyNoticeIndex = html.indexOf('class="privacy-notice"');
    const submitButtonIndex = html.indexOf('type="submit"');
    expect(privacyNoticeIndex).toBeGreaterThan(0);
    expect(submitButtonIndex).toBeGreaterThan(privacyNoticeIndex);
    expect(html).toContain(
      "No escribas contraseñas ni datos de terceros en los campos de nombre o equipo.",
    );
    expect(html).toContain("este formulario no admite explicaciones libres");
    expect(html).toContain("Aviso de Privacidad");
    expect(html).toContain('href="/legal/privacy"');

    // 3. Proper escaping (no raw script tags injected from the site key)
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain(
      'data-sitekey="site-key&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"',
    );
  });
});
