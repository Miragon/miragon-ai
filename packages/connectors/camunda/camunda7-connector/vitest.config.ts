import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "../../../../vitest.shared"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      coverage: {
        // Ratchet: frozen 2 points under the 2026-08-07 baseline (default run
        // without TEST_DATABASE_URL; the pg run covers strictly more). Raise
        // when you push coverage up; never lower.
        thresholds: { statements: 37, branches: 25, functions: 29, lines: 38 },
      },
    },
  }),
)
