import type { ComponentType } from "react"
import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"

/**
 * Wraps a "single-data" widget component (signature `({ data }: { data: T | null })`)
 * so it can be registered as a framework `WidgetComponent` (which receives
 * `WidgetProps = { keys, context }`). The adapter looks up the matching
 * step result in `context.steps` by its `_dataType` and forwards `result.data`
 * to the wrapped widget. Lets `render-view` and `*_show_*` tools (via
 * `buildSingleWidgetView`) share the same widget components without changing
 * their props.
 */
export function adaptDataWidget<T>(
  Widget: ComponentType<{ data: T | null }>,
  dataType: string,
): WidgetComponent {
  function AdaptedWidget({ context }: WidgetProps) {
    const stepResult = Object.values(context.steps).find((s) => s._dataType === dataType)
    const data = (stepResult?.data ?? null) as T | null
    return <Widget data={data} />
  }
  AdaptedWidget.displayName = `Adapted(${Widget.displayName ?? Widget.name ?? "Widget"})`
  return AdaptedWidget
}
