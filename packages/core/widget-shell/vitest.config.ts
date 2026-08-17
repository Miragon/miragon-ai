import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "../../../vitest.shared"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      coverage: {
        // Ratchet: frozen 2 points under the baseline. Raise when you push
        // coverage up; never lower. Re-baselined UP 2026-08-17: the Postgres
        // adapters left the measurement (shared `coverage.exclude` — they are
        // only executable under `pnpm test:pg`), so the numbers now describe
        // the code this run actually exercises; measured statements 85.35 /
        // branches 88.55 / functions 95.04 / lines 86.86.
        thresholds: { statements: 83, branches: 86, functions: 93, lines: 84 },
      },
    },
  }),
)
