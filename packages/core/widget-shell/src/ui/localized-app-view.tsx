import { McpAppView, type ViewTitleMode } from "@miragon/mcp-toolkit-ui/app"
import type { ComponentProps } from "react"
import { useShellHost } from "./shell-host.js"

/**
 * The toolkit's framework view tool: a layout composed at call time (by the
 * model or a saved dashboard), whose widgets carry no heading of their own
 * (`shell:kpi-grid`, `shell:data-table`) — the view title is its one heading.
 */
const COMPOSED_VIEW_TOOLS: ReadonlySet<string> = new Set(["render-view"])

/**
 * Whether the toolkit's toolbar shows the view title, so a view has ONE
 * title: a module's own view (`<module>_show_*`, `camunda7_open_cockpit`)
 * renders its widget's heading (`WidgetHeader`, the cockpit's navigation),
 * so the toolbar hides the title there; a composed `render-view` keeps it.
 * A host that does not name the rendering tool keeps the title too.
 */
export function viewTitleMode(toolName: string | undefined): ViewTitleMode {
  return toolName === undefined || COMPOSED_VIEW_TOOLS.has(toolName) ? "show" : "hide"
}

/**
 * The toolkit's McpAppView as every composed-server view mounts it. Its chrome
 * (loading, error and cancelled states, toolbar buttons) speaks the locale the
 * ProfileGate provides through the toolkit's own en/de catalog, the
 * Fullscreen toggle renders only where the host offers fullscreen, and Lucide
 * icons draw at the CI stroke (all toolkit 2.7). What stays here is the title
 * policy ({@link viewTitleMode}).
 */
export function LocalizedAppView(props: Omit<ComponentProps<typeof McpAppView>, "titleMode">) {
  const { toolName } = useShellHost()
  return <McpAppView {...props} titleMode={viewTitleMode(toolName)} />
}
