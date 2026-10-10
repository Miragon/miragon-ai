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
        // you push coverage up; never lower. Raised 2026-10-08 with the
        // behavioural contract test over every query function (measured
        // without test support: 93.4 / 68.91 / 96.19 / 93.61) and with the
        // Prometheus HTTP client under test (95.69 / 80.64 / 98.01 / 96.06).
        // Raised 2026-10-10 with the query-honesty guard (#336: windows,
        // no-data shapes, scope echo) over every query function
        // (99.03 / 88.53 / 98.62 / 99.78); branches again with the engine
        // presence probe on the dashboard's live gauges (99.04 / 89.33 / 98.63 / 99.78).
        thresholds: { statements: 97, branches: 87, functions: 97, lines: 98 },
      },
    },
  }),
)
