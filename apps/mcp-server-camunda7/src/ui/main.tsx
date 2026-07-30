import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { McpUseProvider } from "mcp-use/react"
import { HostWidgetsProvider } from "@miragon-ai/widget-shell/widgets"
import { widgetRegistry } from "./widget-registry.js"
import { LocalizedAppView } from "./app-view-labels.js"
import { ProfileGate } from "./profile-gate.js"
import "./globals.css"

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Root element #root not found")

createRoot(rootElement).render(
  <StrictMode>
    <McpUseProvider>
      <ProfileGate>
        {/* The full registry, provided for composed views that render another
            module's section widget by raw id (the cockpit settings tab). */}
        <HostWidgetsProvider widgets={widgetRegistry}>
          <LocalizedAppView widgets={widgetRegistry} />
        </HostWidgetsProvider>
      </ProfileGate>
    </McpUseProvider>
  </StrictMode>,
)
