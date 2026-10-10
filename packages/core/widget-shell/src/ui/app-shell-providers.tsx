import type { ReactNode } from "react"
import { McpUseHostBridgeProvider, type WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { HostDocument } from "./host-document.js"
import { HostWidgetsProvider } from "./host-widgets.js"
import { ProfileGate } from "./profile-gate.js"
import { ViewHostBridge } from "./shell-host.js"

export interface AppShellProvidersProps {
  /** The host bundle map — also provided to composed views via HostWidgetsProvider. */
  widgets: Record<string, WidgetComponent>
  /** Name of the user-profile data feed for the ProfileGate (locale + theme). */
  profileTool: string
  children: ReactNode
}

/**
 * The provider stack every composed-server host mounts under `bootstrapView`:
 * host context (+ display mode) → host document (style variables, fonts,
 * layout) → host bridge → profile gate (the effective locale/theme from
 * profile > host > OS/en) → host widget registry. Order is load-bearing (the
 * bridge reads mcp-use's view-scoped hooks, the document layer and the gate
 * read the host context it provides, the gate needs the host bridge) — hosts
 * compose their app-specific layers (e.g. a standalone drill-in shell) inside.
 */
export function AppShellProviders({ widgets, profileTool, children }: AppShellProvidersProps) {
  return (
    <ViewHostBridge>
      <HostDocument>
        <McpUseHostBridgeProvider>
          <ProfileGate profileTool={profileTool}>
            <HostWidgetsProvider widgets={widgets}>{children}</HostWidgetsProvider>
          </ProfileGate>
        </McpUseHostBridgeProvider>
      </HostDocument>
    </ViewHostBridge>
  )
}
