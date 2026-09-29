import { env } from "cloudflare:workers";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import legalVersion from "../../docs/legal/LEGAL_VERSION.json";
import privacyMarkdownRaw from "../../docs/legal/privacy-notice-0.1.0-draft.es.md?raw";
import termsMarkdownRaw from "../../docs/legal/terms-0.1.0-draft.es.md?raw";
import { app } from "../src";
import legalData from "../src/backend/legal/legal-content.json";
import { sha256 } from "../src/backend/security/crypto";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    ENVIRONMENT: "test",
    REQUIRED_TERMS_VERSION: "0.1.0-draft",
    ...overrides,
  } as unknown as Env;
}

describe("W-5 terms acceptance and legal pages", () => {
  it("verifies SHA-256 of served legal content strictly matches docs/legal/LEGAL_VERSION.json and raw markdown", () => {
    // 1. Direct comparison with docs/legal/LEGAL_VERSION.json
    expect(legalVersion.termsVersion).toBeDefined();
    expect(legalVersion.termsSha256).toBeDefined();
    expect(legalVersion.privacyVersion).toBeDefined();
    expect(legalVersion.privacySha256).toBeDefined();

    // 2. Normalize and compute SHA-256 from docs/legal markdown
    const termsMarkdown = termsMarkdownRaw.replace(/\r\n/g, "\n");
    const privacyMarkdown = privacyMarkdownRaw.replace(/\r\n/g, "\n");

    const computedTermsSha256 = crypto
      .createHash("sha256")
      .update(Buffer.from(termsMarkdown, "utf8"))
      .digest("hex");
    const computedPrivacySha256 = crypto
      .createHash("sha256")
      .update(Buffer.from(privacyMarkdown, "utf8"))
      .digest("hex");

    // 3. Verify LEGAL_VERSION.json reflects the exact hash of the docs markdown
    expect(legalVersion.termsSha256).toBe(computedTermsSha256);
    expect(legalVersion.privacySha256).toBe(computedPrivacySha256);

    // 4. Verify worker served content strictly matches docs and LEGAL_VERSION.json
    expect(legalData.termsVersion).toBe(legalVersion.termsVersion);
    expect(legalData.termsSha256).toBe(legalVersion.termsSha256);
    expect(legalData.termsMarkdown).toBe(termsMarkdown);

    expect(legalData.privacyVersion).toBe(legalVersion.privacyVersion);
    expect(legalData.privacySha256).toBe(legalVersion.privacySha256);
    expect(legalData.privacyMarkdown).toBe(privacyMarkdown);
  });

  it("serves accessible HTML for /legal/terms and /legal/privacy in Spanish", async () => {
    const workerEnv = makeEnv();

    const termsRes = await app.fetch(
      new Request("https://aegisdesk.test/legal/terms"),
      workerEnv,
    );
    expect(termsRes.status).toBe(200);
    const termsHtml = await termsRes.text();
    expect(termsHtml).toContain('lang="es"');
    expect(termsHtml).toContain("Términos y Condiciones");

    const privacyRes = await app.fetch(
      new Request("https://aegisdesk.test/legal/privacy"),
      workerEnv,
    );
    expect(privacyRes.status).toBe(200);
    const privacyHtml = await privacyRes.text();
    expect(privacyHtml).toContain('lang="es"');
    expect(privacyHtml).toContain("Aviso de Privacidad");
  });

  it("accepts terms acceptance idempotently with 204 and rejects invalid requests", async () => {
    const workerEnv = makeEnv();
    const now = new Date().toISOString();
    const instId = "50000000-0000-4000-8000-000000000001";
    const token = "terms-test-token-123456789012345678901234567890";
    const tokenHash = await sha256(token);

    await workerEnv.DB.prepare(
      "INSERT INTO installations (id, token_hash, equipment_name, sidc_target, created_at, updated_at, shell_version, sidc_version, status) VALUES (?, ?, 'PC-Terms', 'C:\\app.exe', ?, ?, '1.0.0', '1.0.0', 'active')",
    )
      .bind(instId, tokenHash, now, now)
      .run();

    const validBody = {
      termsVersion: "0.1.0-draft",
      termsSha256:
        "9dc95681c0fa738e52f87c57e025b5bf8bdbbae0a1ebb1a805b85726e35851b6",
      acceptedAt: "2026-09-29T12:00:00.000Z",
      method: "installer",
      shellVersion: "1.0.0",
    };

    // 1. Missing auth -> 401
    const unauthRes = await app.fetch(
      new Request("https://aegisdesk.test/api/shell/terms-acceptance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody),
      }),
      workerEnv,
    );
    expect(unauthRes.status).toBe(401);

    // 2. Invalid body -> 400
    const invalidBodyRes = await app.fetch(
      new Request("https://aegisdesk.test/api/shell/terms-acceptance", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...validBody, method: "invalid-method" }),
      }),
      workerEnv,
    );
    expect(invalidBodyRes.status).toBe(400);

    // 3. Valid body -> 204 No Content
    const res1 = await app.fetch(
      new Request("https://aegisdesk.test/api/shell/terms-acceptance", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(validBody),
      }),
      workerEnv,
    );
    expect(res1.status).toBe(204);

    // Check DB record
    const row = await workerEnv.DB.prepare(
      "SELECT * FROM terms_acceptances WHERE installation_id = ?",
    )
      .bind(instId)
      .first<{
        installation_id: string;
        terms_version: string;
        terms_sha256: string;
        received_at: string;
        method: string;
      }>();
    expect(row).not.toBeNull();
    expect(row?.terms_version).toBe("0.1.0-draft");
    expect(row?.method).toBe("installer");
    expect(row?.received_at).toBeDefined();

    // 4. Idempotent call -> 204 No Content and still exactly 1 row
    const res2 = await app.fetch(
      new Request("https://aegisdesk.test/api/v1/shell/terms-acceptance", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(validBody),
      }),
      workerEnv,
    );
    expect(res2.status).toBe(204);

    const count = await workerEnv.DB.prepare(
      "SELECT count(*) as count FROM terms_acceptances WHERE installation_id = ?",
    )
      .bind(instId)
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
  });
});
