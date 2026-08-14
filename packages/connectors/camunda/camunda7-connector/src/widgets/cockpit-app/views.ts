import { normalizeLayout, type LayoutConfig, type RowDef } from "@miragon/mcp-toolkit-core"

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
 * What the surrounding host can actually render: every widget id resolvable in
 * this bundle — this module's own widgets merged under the host root's full
 * registry (`HostWidgetsProvider`) — in registration order, which is the
 * composition root's module order.
 *
 * Views that compose ACROSS modules derive their rows from it instead of a
 * hand-maintained list, so a host that composes a module this package has never
 * heard of still renders that module's sections. Views scoped to camunda7
 * ignore it.
 */
export interface ViewContext {
  widgetIds: readonly string[]
}

/**
 * The convention that marks a module's settings section: the `<module>:settings`
 * widget id it catalogues for its own section.
 */
const SETTINGS_SECTION_SUFFIX = ":settings"

/**
 * camunda7's own profile panel. It predates the convention and keeps its id —
 * a rename would silently drop the widget from every stored layout referencing
 * it — so this module pins its OWN section (not a cross-module list) first.
 */
const OWN_SETTINGS_SECTION = "camunda7:user-profile"

/**
 * The settings page, assembled from what the host actually composed: camunda7's
 * profile panel first, then one row per `<module>:settings` widget in the host
 * registry, in registration order (the composition root's module order).
 *
 * This is the host-extension point of the settings tab. A module contributes
 * its section by catalogueing it as `<module>:settings` and having its widget
 * map spread into the host bundle's registry (link 3 of the widget chain) — no
 * edit in this package, so a custom module composed from the published packages
 * is a first-class citizen of the page.
 *
 * Section ids stay raw strings on purpose (tier-2 cross-module reference):
 * `HostWidgetsProvider` resolves them at runtime and `filterLayoutToWidgets`
 * drops whatever resolves nowhere. Deriving the rows from the same registry
 * makes that degradation structural — a module that isn't composed contributes
 * no id, so it has no section. Callers that pass no ids (a host without the
 * provider) get camunda7's own section alone. A module that IS bundled but
 * inactive at runtime (`MCP_ACTIVE_MODULES`) still contributes its id; its
 * section widget hides itself once its feed answers "unknown tool".
 */
export function settingsLayout(widgetIds: readonly string[] = []): LayoutConfig {
  const foreign = widgetIds.filter(
    (id) => id !== OWN_SETTINGS_SECTION && id.endsWith(SETTINGS_SECTION_SUFFIX),
  )
  // Deduped: callers may merge several registries into the id list.
  return [OWN_SETTINGS_SECTION, ...new Set(foreign)].map((widget) => ({
    row: [{ widget, props: {} }],
  }))
}

/**
 * How every view is built: from the route params, plus the composition context
 * for the views that span modules. Declared once so the router can call
 * `cockpitViews[section](params, ctx)` uniformly — a per-view signature would
 * collapse to the narrowest one across the union at the call site.
 */
type CockpitViewBuilder = (params: ViewParams, ctx?: ViewContext) => LayoutConfig

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
const views = {
  // One verdict header, one KPI row: the engine-health widget IS the overview's
  // verdict surface. The per-definition health detail lives in the definitions
  // table below (row tones); stacking the old process-health KPI grid on top
  // would duplicate the same numbers and a second competing AI handoff.
  overview: ({ engine }: ViewParams): LayoutConfig => [
    { row: [{ widget: "camunda7:engine-health", props: { engine } }] },
    { row: [{ widget: "camunda7:process-definitions-table", props: { engine } }] },
  ],
  // Drill target of the overview KPIs (running instances / total processes):
  // the searchable, paged process list as its own page.
  "process-list": ({ engine }: ViewParams): LayoutConfig => [
    { row: [{ widget: "camunda7:process-list", props: { engine } }] },
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
  // The settings page composes one section per module and assembles itself from
  // the host registry (see `settingsLayout`) — this package holds no list of
  // other modules' sections.
  settings: (_params: ViewParams, ctx?: ViewContext): LayoutConfig =>
    settingsLayout(ctx?.widgetIds),
} satisfies Record<string, CockpitViewBuilder>

export type CockpitViewId = keyof typeof views

/**
 * The view catalogue as the router uses it: one uniform builder signature over
 * the literal view ids.
 */
export const cockpitViews: Record<CockpitViewId, CockpitViewBuilder> = views

/**
 * Drop layout cells whose widget id resolves to no component in `widgets`
 * (cross-module ids in a host without the `HostWidgetsProvider`), then drop
 * emptied rows — the tier-2 degradation for composed views: a missing module's
 * section simply disappears instead of rendering an unknown-widget error.
 */
export function filterLayoutToWidgets(
  layout: LayoutConfig,
  widgets: Record<string, unknown>,
): LayoutConfig {
  const filterRows = (rows: RowDef[]): RowDef[] =>
    rows
      .map((r) => ({ ...r, row: r.row.filter((cell) => cell.widget in widgets) }))
      .filter((r) => r.row.length > 0)
  const normalized = normalizeLayout(layout)
  return "tabs" in normalized
    ? { tabs: normalized.tabs.map((tab) => ({ ...tab, rows: filterRows(tab.rows) })) }
    : { rows: filterRows(normalized.rows) }
}
