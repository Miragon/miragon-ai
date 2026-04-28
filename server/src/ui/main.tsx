import * as React from "react"
import { StrictMode } from "react"
import * as ReactDOMClient from "react-dom/client"
import { createRoot } from "react-dom/client"
import { McpUseProvider } from "mcp-use/react"
import { McpAppView } from "@miragon/mcp-toolkit-ui/app"
import { widgetRegistry } from "./widget-registry.js"
import "./globals.css"

// Expose host React + ReactDOM on globalThis so upstream-hosted widget bundles
// can resolve their externalised `react` / `react/jsx-runtime` imports through
// the importmap shim in `mcp-app.html`. Same React instance as the host —
// hooks + context rely on instance identity, not just version parity.
Object.assign(globalThis, { React, ReactDOM: ReactDOMClient })

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Root element #root not found")

createRoot(rootElement).render(
  <StrictMode>
    <McpUseProvider>
      <McpAppView widgets={widgetRegistry} />
    </McpUseProvider>
  </StrictMode>,
)
