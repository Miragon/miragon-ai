import { coverageConfigDefaults, defineConfig } from "vitest/config"

/**
 * Shared vitest base merged into every package-level vitest.config.ts via
 * `mergeConfig`. Centralizes the coverage baseline: v8 provider, per-package
 * output under `<package>/coverage/`. Each package's vitest.config.ts pins
 * ratchet thresholds frozen just under its measured baseline — a change that
 * drops coverage below them fails `pnpm test`.
 */
export const sharedConfig = defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      enabled: true,
      // json-summary feeds scripts/fitness-report.mjs (pnpm fitness).
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      exclude: [
        ...coverageConfigDefaults.exclude,
        // Postgres adapters + the migration runner: executable ONLY against a
        // real database, so their suites are the opt-in `pnpm test:pg` slice
        // (skipped without TEST_DATABASE_URL) — exactly like the Playwright
        // host simulation, which also stays out of these numbers. Counting
        // them would make every ratchet depend on whether a database happened
        // to be reachable: the same commit would measure ~10 points apart on a
        // developer machine with the compose stack up and in CI without it.
        "**/src/postgres.ts",
        "**/src/*-store-postgres.ts",
      ],
    },
  },
})
