import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(
  env.DB,
  (
    env as typeof env & {
      TEST_MIGRATIONS?: Array<{ name: string; queries: string[] }>;
    }
  ).TEST_MIGRATIONS ?? [],
);
