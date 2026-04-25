import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { McpUseProvider } from "mcp-use/react"
import { McpAppView } from "@miragon/mcp-toolkit-ui/app"
import { widgetRegistry } from "./widget-registry.js"
import "./globals.css"

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Root element #root not found")

createRoot(rootElement).render(
  <StrictMode>
    <McpUseProvider>
      <McpAppView widgets={widgetRegistry} />
    </McpUseProvider>
  </StrictMode>,
)
