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
        // 37.54%). Raised 2026-08-17 with module.ts under test (measured
        // statements 38.66 / branches 27.88 / functions 32.05 / lines 39.09).
        // Raised 2026-08-25 with data/cockpit-data.ts under test (measured
        // statements 42.05 / branches 32.61 / functions 35.76 / lines 42.50).
        thresholds: { statements: 39, branches: 30, functions: 33, lines: 40 },
      },
    },
  }),
)
