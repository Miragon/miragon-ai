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
    },
  }),
)
