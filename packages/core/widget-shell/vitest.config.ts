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
        // branches 88.55 / functions 95.04 / lines 86.86. Raised 2026-10-08
        // (#324: the shared boot, HTTP edge and body-capped listener landed
        // with their suites): measured 90.76 / 90.94 / 96.31 / 91.91. Raised
        // again with the #324 review fixes (in-flight budget, guard before the
        // body): measured 91.24 / 91.57 / 96.47 / 92.32. Raised again with
        // #331 (session cleanup gone, `oauthFromEnv` fully covered): measured
        // 92.66 / 93.26 / 97.22 / 93.45.
        thresholds: { statements: 90, branches: 91, functions: 95, lines: 91 },
      },
    },
  }),
)
