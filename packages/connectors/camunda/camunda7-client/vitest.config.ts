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
        thresholds: { statements: 44, branches: 32, functions: 45, lines: 44 },
      },
    },
  }),
)
