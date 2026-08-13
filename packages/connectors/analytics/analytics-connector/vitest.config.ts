import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "../../../../vitest.shared"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      coverage: {
        // Ratchet: frozen ~2 points under the baseline. Raise when you push
        // coverage up; never lower. Documented re-baseline 2026-08-13: the
        // shared settings/i18n/toolset boilerplate (a well-tested surface)
        // moved to @miragon-ai/widget-shell, where the SAME code is held to
        // that package's higher thresholds — this package's percentages
        // shifted without a single line losing tests.
        thresholds: { statements: 26, branches: 8, functions: 15, lines: 27 },
      },
    },
  }),
)
