import { StrictMode } from "react"
import { bootstrapView } from "mcp-use/react"
import { AppShellProviders, LocalizedAppView } from "@miragon-ai/widget-shell/widgets"
import { Camunda7StandaloneShell } from "@miragon-ai/camunda7-connector/widgets"
import { widgetRegistry } from "./widget-registry.js"
import "./globals.css"

/**
 * Stable name of the camunda7 user-profile feed (app-only `*_data` tool).
 * Hardcoded so the host bundle doesn't take a build-time dependency on the
 * module's tool-name constants — the feed name is part of the module contract.
 */
const PROFILE_DATA_TOOL = "camunda7_user_profile_data"

/**
 * The document's MCP App view: the shared provider stack (theme, host bridge,
 * display mode, profile locale/theme, widget registry) plus this app's own
 * layers.
 */
function AppRoot() {
  return (
    <StrictMode>
      <AppShellProviders widgets={widgetRegistry} profileTool={PROFILE_DATA_TOOL}>
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
bootstrapView({ default: AppRoot })
