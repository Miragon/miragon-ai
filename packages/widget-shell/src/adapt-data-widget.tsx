import type { ComponentType } from "react"
import { ModelContext } from "mcp-use/react"
import type { WidgetProps } from "@miragon/mcp-toolkit-core"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"

/**
 * Builds the model-context line for an adapted widget. Receives the resolved
 * step data (never null — the adapter skips the description while loading) plus
 * the per-cell layout props so scope filters that only travel as props (e.g.
 * `period` / `engine` on the analytics dashboard widgets) can be reported too.
 */
export type DescribeForModel<T> = (
  data: NonNullable<T>,
  props: Readonly<Record<string, unknown>>,
) => string

/**
 * Wraps a "single-data" widget component (signature `({ data }: { data: T | null })`)
 * so it can be registered as a framework `WidgetComponent` (which receives
 * `WidgetProps = { keys, context, widgetProps? }`). The adapter looks up the
 * matching step result in `context.steps` by its `_dataType` and forwards
 * `result.data` to the wrapped widget. Lets `render-view` and `*_show_*` tools
 * (via `buildSingleWidgetView`) share the same widget components without
 * changing their props.
 *
 * Per-cell `props` from the layout (`row[].props`) are spread onto the
 * wrapped widget as named props. This lets the same widget appear multiple
 * times in one view with different scoping (e.g. one tab per process key).
 *
 * When `describeForModel` is provided the adapter wraps the widget in a
 * `ModelContext` so the model knows what the user is looking at (view identity,
 * active filters, headline numbers) without per-widget boilerplate. The
 * description is only rendered once the step data is present; widgets that
 * self-fetch when the adapter has no data (cockpit views) must render their own
 * `<ModelContext>` instead.
 */
export function adaptDataWidget<T>(
  Widget: ComponentType<{ data: T | null } & Record<string, unknown>>,
  dataType: string,
  describeForModel?: DescribeForModel<T>,
): WidgetComponent {
  function AdaptedWidget({ context, widgetProps }: WidgetProps) {
    const stepResult = Object.values(context.steps).find((s) => s._dataType === dataType)
    const data = (stepResult?.data ?? null) as T | null
    const widget = <Widget {...(widgetProps ?? {})} data={data} />
    if (data == null || !describeForModel) return widget
    return <ModelContext content={describeForModel(data, widgetProps ?? {})}>{widget}</ModelContext>
  }
  AdaptedWidget.displayName = `Adapted(${Widget.displayName ?? Widget.name ?? "Widget"})`
  return AdaptedWidget
}
