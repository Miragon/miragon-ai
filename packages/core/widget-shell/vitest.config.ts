import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "../../../vitest.shared"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      coverage: {
        // Ratchet: frozen 2 points under the 2026-08-13 baseline (the
        // profile-store/composition/base-pattern extractions moved their tests
        // in with them). Raise when you push coverage up; never lower.
        thresholds: { statements: 80, branches: 84, functions: 87, lines: 81 },
      },
    },
  }),
)
