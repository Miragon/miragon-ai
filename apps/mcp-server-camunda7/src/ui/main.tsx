import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { McpUseProvider } from "mcp-use/react"
import { HostWidgetsProvider } from "@miragon-ai/widget-shell/widgets"
import { Camunda7StandaloneShell } from "@miragon-ai/mcp-camunda7/widgets"
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
          {/* Client-side drill-in for standalone camunda7 widget renders — the
              same clicks that navigate inside the cockpit navigate here too,
              instead of degrading to a chat follow-up. Inert for the cockpit
              (own NavProvider) and for non-camunda7 widgets (no useNav). */}
          <Camunda7StandaloneShell>
            <LocalizedAppView widgets={widgetRegistry} />
          </Camunda7StandaloneShell>
        </HostWidgetsProvider>
      </ProfileGate>
    </McpUseProvider>
  </StrictMode>,
)
