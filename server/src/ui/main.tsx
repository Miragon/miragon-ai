import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { McpUseProvider } from "mcp-use/react"
import { McpAppView } from "./McpAppView.js"
import "./globals.css"

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Root element #root not found")

createRoot(rootElement).render(
  <StrictMode>
    <McpUseProvider>
      <McpAppView />
    </McpUseProvider>
  </StrictMode>,
)
