import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

type Migration = { name: string; queries: string[] };

describe("remote administration migration seam", () => {
  it("preserves an existing installation graph while adding administration data", async () => {
    const bindings = env as typeof env & {
      TEST_ALL_MIGRATIONS?: Migration[];
    };

    await expect(
      applyD1Migrations(env.DB, bindings.TEST_ALL_MIGRATIONS ?? []),
    ).resolves.toBeUndefined();

    const installation = await env.DB.prepare(
      "SELECT equipment_name, shell_version, status, updated_at, organization_id, group_id, assigned_user_id FROM installations WHERE id = ?",
    )
      .bind("11111111-1111-4111-8111-111111111111")
      .first<{
        equipment_name: string;
        shell_version: string;
        status: string;
        updated_at: string;
        organization_id: string | null;
        group_id: string | null;
        assigned_user_id: string | null;
      }>();
    expect(installation).toMatchObject({
      equipment_name: "Equipo existente",
      shell_version: "0.2.0",
      status: "active",
      organization_id: null,
      group_id: null,
      assigned_user_id: null,
    });
    expect(installation?.updated_at).toBe("2026-01-01T12:00:00.000Z");

    const cycle = await env.DB.prepare(
      "SELECT due_at, updated_at FROM cycles WHERE id = ?",
    )
      .bind("22222222-2222-4222-8222-222222222222")
      .first<{ due_at: string; updated_at: string }>();
    expect(cycle).toEqual({
      due_at: "2026-04-01T12:00:00.000Z",
      updated_at: "2026-01-01T12:00:00.000Z",
    });

    const event = await env.DB.prepare(
      "SELECT type, installation_id, cycle_id FROM events WHERE id = ?",
    )
      .bind("33333333-3333-4333-8333-333333333333")
      .first();
    expect(event).toEqual({
      type: "opening",
      installation_id: "11111111-1111-4111-8111-111111111111",
      cycle_id: "22222222-2222-4222-8222-222222222222",
    });

    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('organizations', 'groups', 'managed_users', 'support_configs') ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results.map((row) => row.name)).toEqual([
      "groups",
      "managed_users",
      "organizations",
      "support_configs",
    ]);
  });
});
