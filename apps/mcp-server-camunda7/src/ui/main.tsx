import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { McpUseProvider } from "mcp-use/react"
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
        <LocalizedAppView widgets={widgetRegistry} />
      </ProfileGate>
    </McpUseProvider>
  </StrictMode>,
)
