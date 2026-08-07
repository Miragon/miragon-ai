import { defineConfig, mergeConfig } from "vitest/config"
import { sharedConfig } from "../../vitest.shared"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ["test/**/*.test.ts"],
      // The E2E smoke test boots a full framework app (plugin registration,
      // HTTP listener, MCP handshake) — give it headroom over the unit default.
      testTimeout: 30_000,
      hookTimeout: 30_000,
      coverage: {
        // Ratchet: frozen 2 points under the 2026-08-07 baseline. Raise when
        // you push coverage up; never lower.
        thresholds: { statements: 48, branches: 51, functions: 53, lines: 50 },
      },
    },
  }),
)
