import { StrictMode, type ReactNode } from "react"
import { ThemeProvider, bootstrapView, useDisplayMode } from "mcp-use/react"
import { McpUseHostBridgeProvider } from "@miragon/mcp-toolkit-ui/app"
import { DisplayModeProvider, HostWidgetsProvider } from "@miragon-ai/widget-shell/widgets"
import { Camunda7StandaloneShell } from "@miragon-ai/camunda7-connector/widgets"
import { widgetRegistry } from "./widget-registry.js"
import { LocalizedAppView } from "./app-view-labels.js"
import { ProfileGate } from "./profile-gate.js"
import "./globals.css"

/**
 * Bridges the view-scoped display mode into the portable widget context:
 * `useDisplayMode` is an mcp-use view hook (legal only under `bootstrapView`),
 * while `WidgetShell` & friends read the host-agnostic `DisplayModeProvider`
 * so they render unchanged in fixtures and standalone embeds.
 */
function ViewDisplayMode({ children }: { children: ReactNode }) {
  const { displayMode } = useDisplayMode()
  return <DisplayModeProvider mode={displayMode}>{children}</DisplayModeProvider>
}

/**
 * The document's MCP App view. `McpToolkitApp` composes exactly
 * ThemeProvider → McpUseHostBridgeProvider → McpAppView; this root inserts
 * the app-owned layers in between (per its docs, the supported way to build
 * a custom shell under your own `bootstrapView` mount).
 */
function AppRoot() {
  return (
    <StrictMode>
      <ThemeProvider>
        <McpUseHostBridgeProvider>
          <ViewDisplayMode>
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
          </ViewDisplayMode>
        </McpUseHostBridgeProvider>
      </ThemeProvider>
    </StrictMode>
  )
}

// bootstrapView owns the mount since mcp-use 2: it connects the ext-apps
// postMessage bridge, installs an error boundary, and auto-reports size
// changes (replacing 1.x's createRoot + McpUseProvider pair).
bootstrapView({ default: AppRoot })
