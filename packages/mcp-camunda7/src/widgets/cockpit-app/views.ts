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
  /** Entry-point focus of the definition view: "incidents" opens the flow in
   *  incident mode and keeps the explorative no-incidents empty state. */
  focus?: "incidents"
}

/**
 * The cockpit's composition layer: each view is a {@link LayoutConfig} of
 * self-fetching widgets, parameterized by the current route. The cockpit renders
 * these generically through the toolkit `WidgetRenderer` — there is no per-view
 * loader code. Widgets receive their scope via the layout cell's `props` (engine
 * + ids), self-fetch under a shared query key (deduped to one call per data
 * type — so the 4-widget process-detail view fetches once), and navigate
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
  // The ONE definition view — every entry point lands here; `focus` only
  // steers the flow's initial mode and the list's no-incidents rendering.
  // All four widgets self-fetch the shared ["camunda7:process-incidents", …]
  // feed, deduped to a single call.
  "process-detail": ({ engine, processDefinitionKey, focus }: ViewParams): LayoutConfig => [
    {
      row: [{ widget: "camunda7:process-detail-header", props: { processDefinitionKey, engine } }],
    },
    {
      row: [{ widget: "camunda7:process-definition-kpi", props: { processDefinitionKey, engine } }],
    },
    {
      row: [
        {
          widget: "camunda7:process-definition-flow",
          props: {
            processDefinitionKey,
            engine,
            // Overview entry leads with the heatmap (the old detail view's
            // identity); the incidents entry leads with the incident overlay.
            initialMode: focus === "incidents" ? "incidents" : "frequency",
          },
        },
      ],
    },
    {
      row: [
        {
          widget: "camunda7:activity-incident-list",
          props: {
            processDefinitionKey,
            engine,
            emptyVariant: focus === "incidents" ? "siblings" : "note",
          },
        },
      ],
    },
  ],
  "process-instances": ({ engine, processDefinitionKey }: ViewParams): LayoutConfig => [
    { row: [{ widget: "camunda7:process-instances", props: { processDefinitionKey, engine } }] },
  ],
  "instance-detail": ({ engine, processInstanceId }: ViewParams): LayoutConfig => [
    { row: [{ widget: "camunda7:instance-detail", props: { processInstanceId, engine } }] },
  ],
  "incident-detail": ({ engine, incidentId }: ViewParams): LayoutConfig => [
    { row: [{ widget: "camunda7:incident-detail", props: { incidentId, engine } }] },
  ],
  // The profile/settings widget self-fetches the session's profile; it needs no
  // route params (engine availability is part of the profile itself).
  settings: (): LayoutConfig => [{ row: [{ widget: "camunda7:user-profile", props: {} }] }],
} satisfies Record<string, (params: ViewParams) => LayoutConfig>

export type CockpitViewId = keyof typeof cockpitViews
