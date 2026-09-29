import { importPKCS8, SignJWT } from "jose";
import type { ShellConfig } from "../../contracts/shell-config";
import type { Notice } from "../domain/cycles";
import { RequestError } from "../errors";

export type StatePayload = {
  iss: string;
  aud: string;
  sub: string;
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
  protocol_version: 1;
  server_time: string;
  cache_until: string;
  cacheMaxAgeSeconds: number;
  offlineGraceSeconds: number;
  requiredTermsVersion: string;
  termsUrl: string;
  privacyUrl: string;
  contact: { name: string; ticket_url: string };
  notices: Notice[];
  config?: ShellConfig;
};

export class StateSigner {
  constructor(private readonly env: Env) {}

  async sign(
    input: Omit<
      StatePayload,
      | "iss"
      | "aud"
      | "iat"
      | "nbf"
      | "exp"
      | "jti"
      | "cacheMaxAgeSeconds"
      | "offlineGraceSeconds"
      | "requiredTermsVersion"
      | "termsUrl"
      | "privacyUrl"
      | "cache_until"
    > & {
      cache_until?: string;
      cacheMaxAgeSeconds?: number;
      offlineGraceSeconds?: number;
      requiredTermsVersion?: string;
      termsUrl?: string;
      privacyUrl?: string;
    },
  ): Promise<string> {
    if (!this.env.STATE_PRIVATE_KEY) {
      throw new RequestError("signing_key_not_configured", 500);
    }

    const cacheMaxAgeSeconds = Number(
      input.cacheMaxAgeSeconds ?? this.env.CACHE_MAX_AGE_SECONDS ?? 259200,
    );
    const offlineGraceSeconds = Number(
      input.offlineGraceSeconds ?? this.env.OFFLINE_GRACE_SECONDS ?? 1209600,
    );
    const rawTermsVersion =
      input.requiredTermsVersion !== undefined
        ? input.requiredTermsVersion
        : this.env.REQUIRED_TERMS_VERSION;
    const requiredTermsVersion =
      typeof rawTermsVersion === "string" && rawTermsVersion.trim().length > 0
        ? rawTermsVersion.trim()
        : undefined;

    const termsUrl = String(
      input.termsUrl ??
        this.env.TERMS_URL ??
        "https://aegisdesk.tonyml.com/legal/terms",
    );
    const privacyUrl = String(
      input.privacyUrl ??
        this.env.PRIVACY_URL ??
        "https://aegisdesk.tonyml.com/legal/privacy",
    );

    const iat = Math.floor(Date.parse(input.server_time) / 1000);
    const exp = iat + cacheMaxAgeSeconds + offlineGraceSeconds;
    const cacheUntil =
      input.cache_until ??
      new Date((iat + cacheMaxAgeSeconds) * 1000).toISOString();

    const key = await importPKCS8(this.env.STATE_PRIVATE_KEY, "EdDSA");
    return new SignJWT({
      protocol_version: input.protocol_version,
      server_time: input.server_time,
      cache_until: cacheUntil,
      cacheMaxAgeSeconds,
      offlineGraceSeconds,
      ...(requiredTermsVersion ? { requiredTermsVersion } : {}),
      termsUrl,
      privacyUrl,
      contact: input.contact,
      notices: input.notices,
      ...(input.config ? { config: input.config } : {}),
    })
      .setProtectedHeader({
        alg: "EdDSA",
        typ: "JWT",
        kid: this.env.STATE_KEY_ID || "ed25519-2026-01",
      })
      .setIssuer(this.env.STATE_ISSUER)
      .setAudience("aegisdesk-shell-v1")
      .setSubject(input.sub)
      .setJti(crypto.randomUUID())
      .setIssuedAt(iat)
      .setNotBefore(iat)
      .setExpirationTime(exp)
      .sign(key);
  }
}
