import { useWidget } from "mcp-use/react"
import { Alert, AlertDescription, Skeleton } from "@miragon/mcp-toolkit-ui"
import { getWidgetComponent } from "./widget-registry.js"

interface ShowWidgetPayload {
  widget: string
  data: unknown
}

/**
 * Minimal App shell for the single-widget `show_*` tool flow. When automation-mcp
 * adopts the full render-view framework (with StepRegistry + WidgetRenderer),
 * this component will be replaced with `McpAppView` from `@miragon/mcp-toolkit-ui`.
 */
export function McpAppView() {
  const { props, isPending } = useWidget<ShowWidgetPayload>()

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!props) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>No widget data available.</AlertDescription>
        </Alert>
      </div>
    )
  }

  const Component = getWidgetComponent(props.widget)
  if (!Component) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Unknown widget: <code>{props.widget}</code>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return <Component data={props.data} />
}
