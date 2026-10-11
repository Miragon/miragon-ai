import { useLocale } from "@miragon/mcp-toolkit-ui"
import { McpAppView, type DescribeViewError, type ViewTitleMode } from "@miragon/mcp-toolkit-ui/app"
import { useMemo, type ComponentProps } from "react"
import { describeError } from "./describe-error.js"
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
 * The view's failed rendering call in the kit's words ({@link describeError}):
 * "Die Engine prod ist nicht erreichbar (HTTP 503)" over "Prüf, ob die Engine
 * läuft …", the raw reason staying under the toolkit's "Details". A reason
 * the kit cannot classify — and a result the chat did not pass on — keeps the
 * toolkit's own words.
 */
export function viewErrorDescriber(locale: string | undefined): DescribeViewError {
  return (reason, info) => {
    if (info?.kind === "blocked" || !reason) return undefined
    const described = describeError(reason, locale)
    return described.kind === "unknown"
      ? undefined
      : { title: described.title, description: described.hint }
  }
}

/**
 * The toolkit's McpAppView as every composed-server view mounts it. Its chrome
 * (loading, error and cancelled states, toolbar buttons) speaks the locale the
 * ProfileGate provides through the toolkit's own en/de catalog, the
 * Fullscreen toggle renders only where the host offers fullscreen, and Lucide
 * icons draw at the CI stroke (all toolkit 2.7). What stays here is the title
 * policy ({@link viewTitleMode}) and the error words ({@link viewErrorDescriber}).
 */
export function LocalizedAppView(
  props: Omit<ComponentProps<typeof McpAppView>, "titleMode" | "describeError">,
) {
  const { toolName } = useShellHost()
  const locale = useLocale()
  const describe = useMemo(() => viewErrorDescriber(locale), [locale])
  return <McpAppView {...props} titleMode={viewTitleMode(toolName)} describeError={describe} />
}
