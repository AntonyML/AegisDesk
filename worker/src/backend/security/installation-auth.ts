import { RequestError } from "../errors";
import { InstallationRepository } from "../persistence/repositories/installation-repository";
import type { InstallationRecord } from "../persistence/schema";
import { sha256 } from "./crypto";
import { bearer } from "./headers";

export class InstallationAuthenticator {
  private readonly repository: InstallationRepository;

  constructor(env: Env) {
    this.repository = new InstallationRepository(env);
  }

  async authenticate(request: Request): Promise<InstallationRecord> {
    const token = bearer(request);
    if (!token) throw new RequestError("installation_auth_required", 401);
    const row = await this.repository.findByTokenHash(await sha256(token));
    if (!row || row.status === "revoked") {
      throw new RequestError("installation_revoked_or_unknown", 403);
    }
    return row;
  }
}
