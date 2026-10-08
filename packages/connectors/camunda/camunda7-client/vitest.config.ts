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
        // mapping under test (measured statements 44.36 / branches 32.27 /
        // functions 44.31 / lines 44.74).
        thresholds: { statements: 42, branches: 30, functions: 42, lines: 42 },
      },
    },
  }),
)
