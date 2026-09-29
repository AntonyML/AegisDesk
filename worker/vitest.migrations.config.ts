import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.resolve("migrations"));
      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations.slice(0, 1),
            TEST_ALL_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    include: ["tests/migration.test.ts"],
    setupFiles: ["./tests/migration-setup.ts"],
  },
});
