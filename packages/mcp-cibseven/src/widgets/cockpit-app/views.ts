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
  activityId?: string
  incidentType?: string
  messageSignature?: string
}

/**
 * The cockpit's composition layer: each view is a {@link LayoutConfig} of
 * self-fetching widgets, parameterized by the current route. The cockpit renders
 * these generically through the toolkit `WidgetRenderer` — there is no per-view
 * loader code. Widgets receive their scope via the layout cell's `props` (engine
 * + ids), self-fetch under a shared query key (deduped to one call per data
 * type — so the 4-widget process-incidents view fetches once), and navigate
 * through `useNav()`.
 *
 * To add a surface: register its widget(s) in `registry.ts`, make the widget
 * self-fetch from these props, and add a row here. That is the whole extension
 * point — the cockpit shell never changes.
 */
export const cockpitViews = {
  // One verdict header, one KPI row: the engine-health widget IS the overview's
  // verdict surface. The per-definition health detail lives in the definitions
  // table below (row tones); stacking the old process-health KPI grid on top
  // would duplicate the same numbers and a second competing AI handoff.
  overview: ({ engine }: ViewParams): LayoutConfig => [
    { row: [{ widget: "camunda7:engine-health", props: { engine } }] },
    { row: [{ widget: "camunda7:process-definitions-table", props: { engine } }] },
  ],
  incidents: ({ engine }: ViewParams): LayoutConfig => [
    { row: [{ widget: "camunda7:incident-overview-kpi", props: { engine } }] },
    { row: [{ widget: "camunda7:incident-process-list", props: { engine } }] },
  ],
  "cluster-detail": ({ engine, activityId, incidentType, messageSignature }: ViewParams) => [
    {
      row: [
        {
          widget: "camunda7:cluster-detail",
          props: { engine, activityId, incidentType, messageSignature },
        },
      ],
    },
  ],
  "process-detail": ({ engine, processDefinitionKey }: ViewParams): LayoutConfig => [
    { row: [{ widget: "camunda7:process-detail", props: { processDefinitionKey, engine } }] },
  ],
  "process-instances": ({ engine, processDefinitionKey }: ViewParams): LayoutConfig => [
    { row: [{ widget: "camunda7:process-instances", props: { processDefinitionKey, engine } }] },
  ],
  "process-incidents": ({ engine, processDefinitionKey }: ViewParams): LayoutConfig => [
    {
      row: [{ widget: "camunda7:process-detail-header", props: { processDefinitionKey, engine } }],
    },
    { row: [{ widget: "camunda7:process-incident-kpi", props: { processDefinitionKey, engine } }] },
    {
      row: [{ widget: "camunda7:process-incident-flow", props: { processDefinitionKey, engine } }],
    },
    {
      row: [{ widget: "camunda7:activity-incident-list", props: { processDefinitionKey, engine } }],
    },
  ],
  "instance-detail": ({ engine, processInstanceId }: ViewParams): LayoutConfig => [
    { row: [{ widget: "camunda7:instance-detail", props: { processInstanceId, engine } }] },
  ],
  "incident-detail": ({ engine, incidentId }: ViewParams): LayoutConfig => [
    { row: [{ widget: "camunda7:incident-detail", props: { incidentId, engine } }] },
  ],
} satisfies Record<string, (params: ViewParams) => LayoutConfig>

export type CockpitViewId = keyof typeof cockpitViews
