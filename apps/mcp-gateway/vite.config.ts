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
    // The widget packages (mcp-cibseven, widget-shell, mcp-analytics) and this
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
