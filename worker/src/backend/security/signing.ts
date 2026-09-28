import { importPKCS8, SignJWT } from "jose";
import type { Notice } from "../domain/cycles";

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
  contact: { name: string; ticket_url: string };
  notices: Notice[];
};

export class StateSigner {
  constructor(private readonly env: Env) {}

  async sign(
    input: Omit<StatePayload, "iss" | "aud" | "iat" | "nbf" | "exp" | "jti">,
  ): Promise<string> {
    if (!this.env.STATE_PRIVATE_KEY) {
      throw new Error("STATE_PRIVATE_KEY is not configured");
    }
    const now = Math.floor(Date.parse(input.server_time) / 1000);
    const exp = Math.floor(Date.parse(input.cache_until) / 1000);
    const key = await importPKCS8(this.env.STATE_PRIVATE_KEY, "EdDSA");
    return new SignJWT({
      protocol_version: input.protocol_version,
      server_time: input.server_time,
      cache_until: input.cache_until,
      contact: input.contact,
      notices: input.notices,
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
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(exp)
      .sign(key);
  }
}
