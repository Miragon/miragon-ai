import type { LayoutConfig } from "@miragon/mcp-toolkit-core"

/**
 * Route parameters available to a cockpit view. Each field is optional; a given
 * view reads only what it needs (`engine` is always present once an engine is
 * resolved). Kept as one flat bag so adding a view never means threading a new
 * prop type through the router.
 */
export interface ViewParams {
  engine: string
  processDefinitionKey?: string
  processInstanceId?: string
  incidentId?: string
}

/**
 * The cockpit's composition layer: each view is a {@link LayoutConfig} of
 * self-fetching widgets, parameterized by the current route. The cockpit renders
 * these generically through the toolkit `WidgetRenderer` — there is no per-view
 * loader code. Widgets receive their scope via the layout cell's `props` (engine
 * + ids), self-fetch under a shared query key (deduped to one call per data
 * type), and navigate through `useNav()`.
 *
 * To add a surface: register its widget(s) in `registry.ts`, make the widget
 * self-fetch from these props, and add a row here. That is the whole extension
 * point — the cockpit shell never changes.
 */
export const cockpitViews = {
  "process-detail": ({ engine, processDefinitionKey }: ViewParams): LayoutConfig => [
    { row: [{ widget: "camunda7:process-detail", props: { processDefinitionKey, engine } }] },
  ],
} satisfies Record<string, (params: ViewParams) => LayoutConfig>

export type CockpitViewId = keyof typeof cockpitViews
