import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    server: {
      deps: {
        // Run the @miragon-ai packages through Vite's resolver instead of
        // native Node ESM: in the miragon-ai monorepo they are workspace-linked
        // (and thus transformed), from npm they would be externalized — and
        // widget-shell's dist uses bundler-style extensionless imports
        // (bpmn-js/lib/NavigatedViewer) that plain Node cannot resolve.
        inline: [/@miragon-ai\//],
      },
    },
  },
})
