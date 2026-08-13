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
        // Ratchet: frozen 2 points under the baseline. Raise when you push
        // coverage up; never lower. Documented re-baseline 2026-08-13: the
        // composition-root machinery (module selection, env warner, boot
        // warnings — the app's best-tested surface) moved to
        // @miragon-ai/widget-shell, where the SAME code is covered by
        // composition.test.ts at that package's higher thresholds; the app's
        // percentages shifted without a single line losing tests.
        thresholds: { statements: 48, branches: 45, functions: 48, lines: 50 },
      },
    },
  }),
)
