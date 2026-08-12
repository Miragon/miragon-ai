import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "../../vitest.shared"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      coverage: {
        // Ratchet: frozen ~2 points under the 2026-08-12 baseline. Raise when
        // you push coverage up; never lower.
        thresholds: { statements: 28, branches: 10, functions: 16, lines: 29 },
      },
    },
  }),
)
