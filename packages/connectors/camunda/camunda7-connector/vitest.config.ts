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
        // Raised 2026-10-08 with the engine-error/timeout guard end to end
        // (measured statements 48.13 / branches 36.38 / functions 41.03 /
        // lines 48.75). Raised again 2026-10-08 with the ctx.signal sweep over
        // every widget tool and feed (measured statements 54.48 / branches
        // 40.44 / functions 47.64 / lines 55.62). Raised 2026-10-09 with the
        // engine-contract wire guards over every write tool (#328; measured
        // statements 61.86 / branches 44.95 / functions 55.72 / lines 63.05).
        // Raised 2026-10-09 with the #328 review guards — task completion,
        // the incident-detail and task-form widget suites (measured
        // statements 66.56 / branches 52.07 / functions 60.53 / lines 67.96).
        thresholds: { statements: 64, branches: 50, functions: 58, lines: 65 },
      },
    },
  }),
)
