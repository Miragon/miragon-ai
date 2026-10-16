import { StrictMode } from "react"
import { bootstrapView } from "mcp-use/react"
import {
  AppShellProviders,
  LocalizedAppView,
  SHELL_VIEW_CONFIG,
} from "@miragon/pulse-widget-shell/widgets"
import { Camunda7StandaloneShell } from "@miragon/pulse-camunda7-connector/widgets"
import { widgetRegistry } from "./widget-registry.js"
import "./globals.css"

/**
 * The document's MCP App view: the shared provider stack (theme, host bridge,
 * display mode, profile language, widget registry) plus this app's own
 * layers.
 */
function AppRoot() {
  return (
    <StrictMode>
      <AppShellProviders widgets={widgetRegistry}>
        {/* Client-side drill-in for standalone camunda7 widget renders;
            inert for the cockpit and for non-camunda7 widgets. */}
        <Camunda7StandaloneShell>
          <LocalizedAppView widgets={widgetRegistry} />
        </Camunda7StandaloneShell>
      </AppShellProviders>
    </StrictMode>
  )
}

// bootstrapView owns the mount: it connects the host postMessage bridge,
// installs an error boundary, and auto-reports size changes.
// Inline and fullscreen only: no view is laid out for picture-in-picture.
bootstrapView({ default: AppRoot, viewConfig: SHELL_VIEW_CONFIG })
