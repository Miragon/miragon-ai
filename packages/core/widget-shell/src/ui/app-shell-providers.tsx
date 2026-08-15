import type { ReactNode } from "react"
import { ThemeProvider, useDisplayMode } from "mcp-use/react"
import { McpUseHostBridgeProvider, type WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { DisplayModeProvider } from "./widget-shell.js"
import { HostWidgetsProvider } from "./host-widgets.js"
import { ProfileGate } from "./profile-gate.js"

/**
 * Bridges the view-scoped display mode (an mcp-use hook, legal only under
 * `bootstrapView`) into the host-agnostic context the shared widgets read.
 */
export function ViewDisplayModeBridge({ children }: { children: ReactNode }) {
  const { displayMode } = useDisplayMode()
  return <DisplayModeProvider mode={displayMode}>{children}</DisplayModeProvider>
}

export interface AppShellProvidersProps {
  /** The host bundle map — also provided to composed views via HostWidgetsProvider. */
  widgets: Record<string, WidgetComponent>
  /** Name of the user-profile data feed for the ProfileGate (locale + theme). */
  profileTool: string
  children: ReactNode
}

/**
 * The provider stack every composed-server host mounts under `bootstrapView`:
 * theme → host bridge → display mode → profile (locale/theme) → host widget
 * registry. Order is load-bearing (ProfileGate needs the host bridge, the
 * display-mode hook needs the view scope) — hosts compose their app-specific
 * layers (e.g. a standalone drill-in shell) inside.
 */
export function AppShellProviders({ widgets, profileTool, children }: AppShellProvidersProps) {
  return (
    <ThemeProvider>
      <McpUseHostBridgeProvider>
        <ViewDisplayModeBridge>
          <ProfileGate profileTool={profileTool}>
            <HostWidgetsProvider widgets={widgets}>{children}</HostWidgetsProvider>
          </ProfileGate>
        </ViewDisplayModeBridge>
      </McpUseHostBridgeProvider>
    </ThemeProvider>
  )
}
