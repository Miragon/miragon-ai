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
        // shifted without a single line losing tests. Raised 2026-10-08 with
        // the version-compare caveats and the comparison/failure widget
        // helpers under test (measured statements 43.62 / branches 22.13 /
        // functions 40.8 / lines 45.32), and with the Prometheus config +
        // ctx.signal sweep over every widget tool (43.32 / 16.15 / 32.35 / 45.12).
        thresholds: { statements: 41, branches: 20, functions: 38, lines: 43 },
      },
    },
  }),
)
