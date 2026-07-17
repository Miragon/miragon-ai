import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { viteSingleFile } from "vite-plugin-singlefile"
import { buildSharedRuntimeImportMap } from "@miragon/mcp-toolkit-ui"

const INPUT = process.env.INPUT
if (!INPUT) {
  throw new Error("INPUT environment variable is not set")
}

/**
 * Merges the shared-runtime import-map entries (mcp-use/react, the three
 * @miragon/mcp-toolkit-ui barrels, @tanstack/react-query) into the
 * hand-written react/react-dom entries in mcp-app.html. Generating them from
 * `buildSharedRuntimeImportMap` keeps the HTML from drifting from the shim
 * constants — the same contract `src/ui/main.tsx` satisfies via
 * `exposeSharedRuntime`.
 */
function sharedRuntimeImportMap(): Plugin {
  return {
    name: "shared-runtime-import-map",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const match = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)
        if (!match?.[1]) return html
        const map = JSON.parse(match[1]) as { imports: Record<string, string> }
        Object.assign(
          map.imports,
          buildSharedRuntimeImportMap({ mcpUseReact: true, toolkitUi: true, reactQuery: true }),
        )
        return html.replace(
          match[0],
          `<script type="importmap">${JSON.stringify(map, null, 2)}</script>`,
        )
      },
    },
  }
}

export default defineConfig({
  plugins: [sharedRuntimeImportMap(), react(), tailwindcss(), viteSingleFile()],
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
