import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "../../../../vitest.shared"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      coverage: {
        // Ratchet: frozen 2 points under the baseline. Raise when you push
        // coverage up; never lower. Raised 2026-10-08 with the engine error
        // mapping under test, again with its review fixes (measured
        // statements 46.02 / branches 34.17 / functions 47.31 / lines 46.14).
        // Raised 2026-10-09 with the engine contract under test (#328;
        // measured statements 54.1 / branches 47.7 / functions 61.71 / lines
        // 53.16).
        thresholds: { statements: 52, branches: 45, functions: 59, lines: 51 },
      },
    },
  }),
)
