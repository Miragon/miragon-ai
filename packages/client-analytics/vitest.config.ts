import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "../../vitest.shared"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      coverage: {
        // Ratchet: frozen 2 points under the 2026-08-07 baseline. Raise when
        // you push coverage up; never lower.
        thresholds: { statements: 84, branches: 64, functions: 92, lines: 83 },
      },
    },
  }),
)
