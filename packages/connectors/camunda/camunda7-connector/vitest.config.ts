import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "../../../../vitest.shared"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      coverage: {
        // Ratchet: frozen 2 points under the baseline (default run without
        // TEST_DATABASE_URL; the pg run covers strictly more). Raise when you
        // push coverage up; never lower. Documented re-baseline 2026-08-13:
        // the profile store + migrations (a well-tested surface) moved to
        // @miragon-ai/widget-shell, where the SAME code is now held to that
        // package's higher thresholds — this package's percentages shifted
        // without a single line losing tests (lines 38 → 35 at measured
        // 37.54%).
        thresholds: { statements: 35, branches: 24, functions: 28, lines: 35 },
      },
    },
  }),
)
