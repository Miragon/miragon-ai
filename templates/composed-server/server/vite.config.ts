import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Bundle-weight guard (assets are inlined, so unused weight is pure wire
    // cost): a latin-only cut of the Geist font — the full fontsource entry
    // ships ~100 KB of unused subsets for an en/de product.
    alias: [
      {
        find: /^@fontsource-variable\/geist$/,
        replacement: fileURLToPath(new URL("./src/ui/geist-latin.css", import.meta.url)),
      },
    ],
    // LOAD-BEARING — never trim this list. The widget packages each resolve
    // their own pnpm instance of the toolkit/React/Query libs; bundling two
    // copies gives each its own React context, `useCallTool()` reads the
    // wrong one, and every in-widget query hangs on "Loading…". Dedupe
    // collapses them to a single instance. @miragon-ai/widget-shell is listed
    // because it is installed from npm here and carries a React context of
    // its own.
    dedupe: [
      "react",
      "react-dom",
      "@tanstack/react-query",
      "mcp-use",
      "@miragon/mcp-toolkit-ui",
      "@miragon/mcp-toolkit-core",
      "@miragon-ai/widget-shell",
    ],
  },
  build: {
    // Two-file output (ES module + stylesheet) for createFrameworkApp's
    // `app.bundle`, with all assets inlined so the bundle stays self-contained
    // inside the sandboxed view iframe.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      input: fileURLToPath(new URL("./src/ui/main.tsx", import.meta.url)),
      output: {
        entryFileNames: "mcp-app.js",
        assetFileNames: "mcp-app.[ext]",
        inlineDynamicImports: true,
      },
    },
    outDir: "dist",
    emptyOutDir: false,
  },
})
