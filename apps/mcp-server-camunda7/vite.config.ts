import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { viteSingleFile } from "vite-plugin-singlefile"

const INPUT = process.env.INPUT
if (!INPUT) {
  throw new Error("INPUT environment variable is not set")
}

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    // Bundle-weight guards for the singlefile widget bundle (everything is
    // base64/text-inlined, so unused weight is pure wire cost):
    // - posthog-js: mcp-use dynamic-imports its telemetry client; the cockpit
    //   sends none — a no-op stub saves ~180 KB minified.
    // - geist: the full fontsource entry ships 5 subsets (incl. cyrillic +
    //   vietnamese); the latin/latin-ext-only CSS saves ~100 KB of
    //   incompressible base64 for an en/de product. Anchored regex so the
    //   stub CSS's own `…/geist/files/*.woff2` urls keep resolving upstream.
    alias: [
      {
        find: /^posthog-js$/,
        replacement: fileURLToPath(new URL("./src/ui/posthog-stub.ts", import.meta.url)),
      },
      {
        find: /^@fontsource-variable\/geist$/,
        replacement: fileURLToPath(new URL("./src/ui/geist-latin.css", import.meta.url)),
      },
    ],
    // The widget packages (mcp-camunda7, widget-shell, mcp-analytics) and this
    // app each resolve their own pnpm instance of the toolkit/React/Query libs
    // (differing peer-dep hashes). Bundling multiple copies of @miragon/mcp-
    // toolkit-ui gives each its own React context: McpAppView (this app's copy)
    // sets the AppQueryProvider's CallToolContext, but a widget's useToolQuery
    // (its package's copy) reads a *different* context → useCallTool() is
    // undefined → every in-widget query is disabled and hangs on "Loading…".
    // Dedupe collapses them to a single instance so the context matches.
    dedupe: [
      "react",
      "react-dom",
      "@tanstack/react-query",
      "mcp-use",
      "@miragon/mcp-toolkit-ui",
      "@miragon/mcp-toolkit-core",
    ],
  },
  build: {
    rollupOptions: {
      input: INPUT,
    },
    outDir: "dist",
    emptyOutDir: false,
  },
})
