import { env } from "cloudflare:workers";
import { decodeJwt, exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { app } from "../src";
import { StateSigner } from "../src/backend/security/signing";

describe("W-4 signed config and cache policy", () => {
  it("fails with 500 when signing key is missing", async () => {
    const workerEnv = {
      ...env,
      ENVIRONMENT: "test",
      STATE_PRIVATE_KEY: undefined,
    } as unknown as Env;

    const signer = new StateSigner(workerEnv);
    await expect(
      signer.sign({
        sub: "install-123",
        protocol_version: 1,
        server_time: new Date().toISOString(),
        contact: {
          name: "Support",
          ticket_url: "https://aegisdesk.test/tickets",
        },
        notices: [],
      }),
    ).rejects.toMatchObject({
      status: 500,
      code: "signing_key_not_configured",
    });
  });

  it("includes all C1 claims with exp = iat + cacheMaxAgeSeconds + offlineGraceSeconds and defaults", async () => {
    const { privateKey } = await generateKeyPair("EdDSA", {
      extractable: true,
    });
    const privatePem = await exportPKCS8(privateKey);

    const workerEnv = {
      ...env,
      ENVIRONMENT: "test",
      STATE_PRIVATE_KEY: privatePem,
      STATE_KEY_ID: "test-key",
      STATE_ISSUER: "https://aegisdesk.test",
      REQUIRED_TERMS_VERSION: "0.1.0-draft",
      TERMS_URL: "https://aegisdesk.test/legal/terms",
      PRIVACY_URL: "https://aegisdesk.test/legal/privacy",
      CACHE_MAX_AGE_SECONDS: 259200,
      OFFLINE_GRACE_SECONDS: 1209600,
    } as unknown as Env;

    const signer = new StateSigner(workerEnv);
    const serverTime = "2026-09-29T12:00:00.000Z";
    const token = await signer.sign({
      sub: "install-123",
      protocol_version: 1,
      server_time: serverTime,
      contact: {
        name: "Support",
        ticket_url: "https://aegisdesk.test/tickets",
      },
      notices: [],
    });

    const claims = decodeJwt(token) as Record<string, unknown>;
    expect(claims.cacheMaxAgeSeconds).toBe(259200);
    expect(claims.offlineGraceSeconds).toBe(1209600);
    expect(claims.requiredTermsVersion).toBe("0.1.0-draft");
    expect(claims.termsUrl).toBe("https://aegisdesk.test/legal/terms");
    expect(claims.privacyUrl).toBe("https://aegisdesk.test/legal/privacy");

    const iat = claims.iat as number;
    const exp = claims.exp as number;
    expect(iat).toBe(Math.floor(Date.parse(serverTime) / 1000));
    expect(exp).toBe(iat + 259200 + 1209600);
  });

  it("respects custom cache and terms configuration from worker env", async () => {
    const { privateKey } = await generateKeyPair("EdDSA", {
      extractable: true,
    });
    const privatePem = await exportPKCS8(privateKey);

    const workerEnv = {
      ...env,
      ENVIRONMENT: "test",
      STATE_PRIVATE_KEY: privatePem,
      STATE_KEY_ID: "test-key",
      STATE_ISSUER: "https://aegisdesk.test",
      REQUIRED_TERMS_VERSION: "0.2.0",
      TERMS_URL: "https://custom.test/terms",
      PRIVACY_URL: "https://custom.test/privacy",
      CACHE_MAX_AGE_SECONDS: 86400,
      OFFLINE_GRACE_SECONDS: 604800,
    } as unknown as Env;

    const signer = new StateSigner(workerEnv);
    const serverTime = "2026-09-29T12:00:00.000Z";
    const token = await signer.sign({
      sub: "install-custom",
      protocol_version: 1,
      server_time: serverTime,
      contact: { name: "Custom", ticket_url: "https://custom.test/tickets" },
      notices: [],
    });

    const claims = decodeJwt(token) as Record<string, unknown>;
    expect(claims.cacheMaxAgeSeconds).toBe(86400);
    expect(claims.offlineGraceSeconds).toBe(604800);
    expect(claims.requiredTermsVersion).toBe("0.2.0");
    expect(claims.termsUrl).toBe("https://custom.test/terms");
    expect(claims.privacyUrl).toBe("https://custom.test/privacy");

    const iat = claims.iat as number;
    const exp = claims.exp as number;
    expect(exp).toBe(iat + 86400 + 604800);
  });

  it("omits requiredTermsVersion claim when REQUIRED_TERMS_VERSION is missing or empty", async () => {
    const { privateKey } = await generateKeyPair("EdDSA", {
      extractable: true,
    });
    const privatePem = await exportPKCS8(privateKey);

    const workerEnv = {
      ...env,
      ENVIRONMENT: "test",
      STATE_PRIVATE_KEY: privatePem,
      STATE_KEY_ID: "test-key",
      STATE_ISSUER: "https://aegisdesk.test",
      REQUIRED_TERMS_VERSION: undefined, // omitted
    } as unknown as Env;

    const signer = new StateSigner(workerEnv);
    const token = await signer.sign({
      sub: "install-noterms",
      protocol_version: 1,
      server_time: new Date().toISOString(),
      contact: {
        name: "Support",
        ticket_url: "https://aegisdesk.test/tickets",
      },
      notices: [],
    });

    const claims = decodeJwt(token) as Record<string, unknown>;
    expect(claims.requiredTermsVersion).toBeUndefined();
  });
});
