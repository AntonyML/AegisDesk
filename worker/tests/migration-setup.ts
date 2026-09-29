import { applyD1Migrations, env } from "cloudflare:test";

type Migration = { name: string; queries: string[] };

const bindings = env as typeof env & {
  TEST_MIGRATIONS?: Migration[];
};

await applyD1Migrations(env.DB, bindings.TEST_MIGRATIONS ?? []);

await env.DB.batch([
  env.DB.prepare(
    "INSERT INTO installations (id, token_hash, equipment_name, sidc_target, created_at, revoked_at, shell_version, sidc_version, last_opened_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    "11111111-1111-4111-8111-111111111111",
    "legacy-token-hash",
    "Equipo existente",
    "C:\\SIDC\\SIDC.exe",
    "2026-01-01T12:00:00.000Z",
    null,
    "0.2.0",
    "legacy",
    "2026-09-28T18:00:00.000Z",
    "active",
  ),
  env.DB.prepare(
    "INSERT INTO cycles (id, installation_id, started_at, duration_months, due_at, status, created_by, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    "22222222-2222-4222-8222-222222222222",
    "11111111-1111-4111-8111-111111111111",
    "2026-01-01T12:00:00.000Z",
    3,
    "2026-04-01T12:00:00.000Z",
    "active",
    "legacy-test",
    "initial",
  ),
  env.DB.prepare(
    "INSERT INTO events (id, installation_id, cycle_id, server_received_at, type, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(
    "33333333-3333-4333-8333-333333333333",
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "2026-09-28T18:00:01.000Z",
    "opening",
    "{}",
  ),
]);
