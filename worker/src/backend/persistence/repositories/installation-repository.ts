import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { type InstallationRecord, installations } from "../schema";

export class InstallationRepository {
  constructor(private readonly env: Env) {}

  async findByTokenHash(tokenHash: string): Promise<InstallationRecord | null> {
    return (
      (await getDb(this.env)
        .select()
        .from(installations)
        .where(eq(installations.tokenHash, tokenHash))
        .get()) ?? null
    );
  }

  async list(): Promise<InstallationRecord[]> {
    return getDb(this.env)
      .select()
      .from(installations)
      .orderBy(desc(installations.createdAt))
      .all();
  }

  async markOpened(
    id: string,
    values: Pick<
      InstallationRecord,
      "lastOpenedAt" | "shellVersion" | "sidcVersion"
    >,
  ): Promise<void> {
    await getDb(this.env)
      .update(installations)
      .set(values)
      .where(eq(installations.id, id))
      .run();
  }

  async revoke(id: string, revokedAt: string): Promise<boolean> {
    const result = await getDb(this.env)
      .update(installations)
      .set({ status: "revoked", revokedAt })
      .where(eq(installations.id, id))
      .run();
    return result.meta.changes === 1;
  }
}
