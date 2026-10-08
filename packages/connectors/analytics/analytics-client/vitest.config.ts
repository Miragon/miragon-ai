import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "../../../../vitest.shared"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      coverage: {
        // Test-only code (the PromQL parser/label checker/source extractors
        // behind the metrics-contract guards), loaded by the suites but never
        // shipped: counted in, its near-total self-coverage would pad the
        // product numbers the ratchet below is meant to hold.
        exclude: ["src/**/*.test-support.ts"],
        // Ratchet: frozen 2 points under the measured baseline. Raise when
        // you push coverage up; never lower. Raised 2026-10-08 once the
        // behavioural contract test ran every query function (measured
        // without test support: statements 93.4 / branches 68.91 /
        // functions 96.19 / lines 93.61).
        thresholds: { statements: 91, branches: 66, functions: 94, lines: 91 },
      },
    },
  }),
)
