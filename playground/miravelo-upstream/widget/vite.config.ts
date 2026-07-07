import { defineConfig } from "vite"
import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Builds the remote leasing-application widget as a single ES module with
 * `react` and `react/jsx-runtime` externalised. The host resolves those
 * imports through its own import map so the widget mounts against the host's
 * React instance instead of shipping its own.
 *
 * Output: dist/leasing-application.js — read at startup by `server.ts` and
 * served as the `ui://miravelo/leasing-application.js` MCP resource.
 */
export default defineConfig({
  root: here,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: path.resolve(here, "LeasingApplication.tsx"),
      formats: ["es"],
      fileName: () => "leasing-application.js",
    },
    rollupOptions: {
      external: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
      output: { inlineDynamicImports: true },
    },
    target: "es2022",
    minify: false,
  },
  plugins: [react()],
})
