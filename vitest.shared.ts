import { defineConfig } from "vitest/config"

/**
 * Shared vitest base merged into every package-level vitest.config.ts via
 * `mergeConfig`. Centralizes the coverage baseline: v8 provider, report-only
 * (no thresholds are enforced), per-package output under `<package>/coverage/`.
 */
export const sharedConfig = defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      enabled: true,
      reporter: ["text-summary"],
      reportsDirectory: "./coverage",
    },
  },
})
