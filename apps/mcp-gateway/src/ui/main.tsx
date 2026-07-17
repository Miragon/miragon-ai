import * as React from "react"
import { StrictMode } from "react"
import * as ReactDOMClient from "react-dom/client"
import { createRoot } from "react-dom/client"
import * as McpUseReact from "mcp-use/react"
import { McpUseProvider } from "mcp-use/react"
import * as McpToolkitUi from "@miragon/mcp-toolkit-ui"
import {
  SHARED_RUNTIME_GLOBALS,
  assertSharedRuntimeExposed,
  exposeSharedRuntime,
} from "@miragon/mcp-toolkit-ui"
import * as McpToolkitUiApp from "@miragon/mcp-toolkit-ui/app"
import { McpAppView } from "@miragon/mcp-toolkit-ui/app"
import * as McpToolkitUiHooks from "@miragon/mcp-toolkit-ui/hooks"
import * as ReactQuery from "@tanstack/react-query"
import { widgetRegistry } from "./widget-registry.js"
import { ProfileGate } from "./profile-gate.js"
import "./globals.css"

// Expose the host's shared runtimes on globalThis so upstream-hosted widget
// bundles resolve their externalised imports (react, mcp-use/react, the
// toolkit-ui barrels, react-query) through the importmap shims in
// `mcp-app.html` (react/react-dom are hand-written there; the rest is
// injected by the sharedRuntimeImportMap plugin in vite.config.ts). Remote
// bundles get the SAME module instances as the host — hooks and React
// contexts (useCallTool etc.) rely on instance identity, not version parity.
// Must match what src/index.ts declares via `hostRuntime`.
exposeSharedRuntime({
  React,
  ReactDOM: ReactDOMClient,
  McpUseReact,
  McpToolkitUi,
  McpToolkitUiApp,
  McpToolkitUiHooks,
  ReactQuery,
})
assertSharedRuntimeExposed(Object.values(SHARED_RUNTIME_GLOBALS))

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Root element #root not found")

createRoot(rootElement).render(
  <StrictMode>
    <McpUseProvider>
      <ProfileGate>
        <McpAppView widgets={widgetRegistry} />
      </ProfileGate>
    </McpUseProvider>
  </StrictMode>,
)
