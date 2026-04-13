import { useWidget } from "mcp-use/react"
import { Alert, AlertDescription, Skeleton } from "@automation-mcp/ui"
import { getWidgetComponent } from "./widget-registry.js"

interface WidgetPayload {
  widget: string
  data: unknown
}

export function McpAppView() {
  const { props, isPending } = useWidget<WidgetPayload>()

  if (isPending) {
    return (
      <div className="p-6 flex flex-col gap-4">
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
