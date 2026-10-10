import { useReducer } from "react"
import { useCallTool, useLocale, useToolQuery } from "@miragon/mcp-toolkit-ui"
import { HostModelContext, WidgetRenderer } from "@miragon/mcp-toolkit-ui/app"
import {
  ViewDataState,
  WidgetShell,
  useHostWidgets,
  useResetOnChange,
} from "@miragon-ai/widget-shell/widgets"
import type { CockpitAppData } from "../../view-models.js"
import { groupEnginesByEnvironment } from "../../lib/environments.js"
import { NavProvider, type NavIntent, type OnNavigate } from "../navigation.js"
import { buildViewParams, intentToView, popTo, pushView, type CockpitView } from "../nav-core.js"
import { camunda7BaseWidgets } from "../registry.js"
import { useHandOff } from "../lib/hand-off.js"
import { cockpitContext, fleetContext, landingContext } from "./model-context.js"
import { translator } from "../../messages/index.js"
import { CAMUNDA7_LIST_ENGINES } from "../../tool-names.js"
import { NavBreadcrumb } from "./breadcrumb.js"
import { cockpitViews, filterLayoutToWidgets } from "./views.js"
import { useAnalyticsActive } from "./analytics-probe.js"
import { FleetView } from "./fleet-view.js"
import { LandingChooser } from "./landing.js"
import { CockpitRefreshButton } from "./refresh-button.js"

export type { CockpitAppData }

interface EnginesResult {
  engines: Array<{ id: string; environment?: string }>
  /** The caller's saved default engine (profile) — null when none is saved. */
  defaultEngineId: string | null
}

type TopSection = "overview" | "incidents" | "settings"

const SECTIONS: Array<{ id: TopSection; intent: NavIntent; icon: string }> = [
  { id: "overview", intent: { type: "overview" }, icon: "▦" },
  { id: "incidents", intent: { type: "incidents" }, icon: "⚠" },
  { id: "settings", intent: { type: "settings" }, icon: "⚙" },
]

function isTopSection(section: CockpitView["section"]): section is TopSection {
  return section === "overview" || section === "incidents" || section === "settings"
}

/**
 * Top-level cockpit scope. Open Cockpit offers two ways in: operate a single
 * engine, or run cross-engine ("fleet") analyses. `landing` is the chooser shown
 * when more than one engine is in the list and none was resolved.
 */
type CockpitScope = { kind: "landing" } | { kind: "fleet" } | { kind: "engine"; engineId: string }

/**
 * The whole navigation state in one reducer: `scope` decides WHICH cockpit is
 * shown (chooser / fleet / one engine) and is the single authority — no render
 * path second-guesses it. `stack` is the real navigation history inside an
 * engine; the breadcrumb renders it 1:1, so "back" always returns to the view
 * the user actually came from.
 */
interface CockpitState {
  scope: CockpitScope
  stack: CockpitView[]
  /**
   * The engine the scope fell back from because it left the engine list —
   * said on screen until the next scope change.
   */
  goneEngineId: string | null
}

type CockpitAction =
  | NavIntent
  | { type: "enter-engine"; id: string }
  | { type: "switch-engine"; id: string }
  | { type: "to-fleet" }
  | { type: "to-landing" }
  | { type: "pop"; to?: number }
  | ({ type: "reconcile" } & ScopeFix)

const ROOT_STACK: CockpitView[] = [{ section: "overview" }]

/**
 * The scope the cockpit OPENS on: the bootstrap's resolved engine
 * (`camunda7_open_cockpit` — per-call `engine` > saved default > the only
 * engine in the caller's list), else the chooser.
 */
function initialState(bootEngineId: string | null): CockpitState {
  return {
    scope: bootEngineId ? { kind: "engine", engineId: bootEngineId } : { kind: "landing" },
    stack: ROOT_STACK,
    goneEngineId: null,
  }
}

interface ScopeFix {
  scope: CockpitScope
  /** The engine that left the list, when that is why the scope changes. */
  gone: string | null
}

/**
 * The scope the CURRENT engine list allows, or null when `scope` stands. The
 * list reloads (an engine curated away in Settings, a bootstrap that raced
 * the filtered list): an engine scope whose engine is gone falls back
 * explicitly — to the only engine left, else the chooser — instead of
 * querying a stale id under a switcher that cannot show it. The chooser and
 * the cross-engine view need more than one engine: with one left the cockpit
 * opens on it. An empty list renders the empty state; nothing to fix.
 */
function reconcileScope(scope: CockpitScope, engineIds: readonly string[]): ScopeFix | null {
  if (engineIds.length === 0) return null
  const sole = engineIds.length === 1 ? engineIds[0] : null
  const fallback: CockpitScope = sole ? { kind: "engine", engineId: sole } : { kind: "landing" }
  if (scope.kind === "engine") {
    return engineIds.includes(scope.engineId) ? null : { scope: fallback, gone: scope.engineId }
  }
  return sole ? { scope: fallback, gone: null } : null
}

function cockpitReducer(state: CockpitState, action: CockpitAction): CockpitState {
  switch (action.type) {
    case "enter-engine":
    case "switch-engine":
      // Same transition from two origins (chooser/fleet vs. in-app switcher):
      // an engine change always restarts at the overview — drill state carried
      // over would resolve ids that belong to another engine.
      return initialState(action.id)
    case "to-fleet":
      return { scope: { kind: "fleet" }, stack: ROOT_STACK, goneEngineId: null }
    case "to-landing":
      return initialState(null)
    case "reconcile":
      return { scope: action.scope, stack: ROOT_STACK, goneEngineId: action.gone }
    case "pop":
      return { ...state, stack: popTo(state.stack, action.to) }
    default: {
      const view = intentToView(action)
      // Top sections are roots, not drills — selecting one resets the trail.
      // (Cockpit-only policy; the shared pushView deliberately never resets.)
      if (isTopSection(view.section)) return { ...state, stack: [view] }
      return { ...state, stack: pushView(state.stack, view) }
    }
  }
}

/**
 * The sidebar's multi-engine block: the way to the cross-engine view (only while
 * `onOpenFleet` is offered — an analytics feature) and the active-engine select,
 * with the environment→engine map as optgroups (flat for a single environment).
 */
function EngineSwitcher({
  engineId,
  engineGroups,
  onSwitch,
  onOpenFleet,
}: {
  engineId: string
  engineGroups: Array<{ id: string; engines: Array<{ id: string }> }>
  onSwitch: (id: string) => void
  onOpenFleet?: () => void
}) {
  const locale = useLocale()
  return (
    <div className="border-border mt-1 flex flex-col gap-2 border-t pt-3">
      {onOpenFleet && (
        <button
          type="button"
          onClick={onOpenFleet}
          className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-2"
        >
          <span aria-hidden="true">⤧</span>
          {translator(locale, "cockpit.nav.crossEngine")}
        </button>
      )}
      <label className="text-muted-foreground flex flex-col gap-1 px-3 text-[11px] font-medium">
        {translator(locale, "cockpit.nav.engine")}
        <select
          aria-label={translator(locale, "cockpit.aria.activeEngine")}
          value={engineId}
          onChange={(e) => onSwitch(e.target.value)}
          className="border-border bg-background text-foreground h-8 rounded-md border px-2 text-xs"
        >
          {engineGroups.length > 1
            ? engineGroups.map((g) => (
                <optgroup key={g.id} label={g.id}>
                  {g.engines.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id}
                    </option>
                  ))}
                </optgroup>
              ))
            : engineGroups
                .flatMap((g) => g.engines)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id}
                  </option>
                ))}
        </select>
      </label>
    </div>
  )
}

/** Why the cockpit left the engine it was on: that engine left the engine list. Nothing without one. */
function EngineGoneNotice({ engineId }: { engineId: string | null }) {
  const locale = useLocale()
  if (!engineId) return null
  return (
    <p role="status" className="text-muted-foreground mb-3 text-sm">
      {translator(locale, "cockpit.engineGone", { engineId })}
    </p>
  )
}

function EnginesEmptyState({
  hasTransport,
  enginesQuery,
}: {
  hasTransport: boolean
  enginesQuery: { isError: boolean; error: Error | null; data: unknown; refetch: () => unknown }
}) {
  const locale = useLocale()
  return (
    <WidgetShell>
      <ViewDataState
        loading={hasTransport && !enginesQuery.isError && enginesQuery.data === undefined}
        error={enginesQuery.error}
        loadingText={translator(locale, "cockpit.loading.engines")}
        emptyText={translator(locale, "cockpit.empty.engines")}
        className="text-muted-foreground p-6 text-sm"
        onRetry={() => void enginesQuery.refetch()}
        retryLabel={translator(locale, "viewState.retry")}
      />
    </WidgetShell>
  )
}

/**
 * The cockpit's navigation state, opened on the bootstrap's engine and kept
 * consistent with the engine list — both in the RENDER phase, so the chooser
 * never flashes before the bootstrap's engine and a stale engine id never
 * reaches a commit, let alone a query.
 */
function useCockpitState(data: CockpitAppData | null, engines: ReadonlyArray<{ id: string }>) {
  const bootEngineId = data?.engineId ?? null
  const [state, dispatch] = useReducer(cockpitReducer, bootEngineId, initialState)
  // A bootstrap delivered into this mount later (or a new one) opens on its
  // engine too.
  useResetOnChange(bootEngineId, () => {
    if (bootEngineId) dispatch({ type: "enter-engine", id: bootEngineId })
  })
  const scopeFix = reconcileScope(
    state.scope,
    engines.map((e) => e.id),
  )
  if (scopeFix) dispatch({ type: "reconcile", ...scopeFix })
  return [state, dispatch] as const
}

export function CockpitApp({ data }: { data: CockpitAppData | null }) {
  // The query transport (AppQueryProvider). Absent when the host wires no
  // callTool — then every useToolQuery stays disabled (pending forever), so the
  // loading state below must not wait on the engines query.
  const queryCallTool = useCallTool()

  // Authoritative engine source: the stable, read-only `camunda7_list_engines`
  // tool (needs no saved default itself). Decoupled from the open_cockpit
  // bootstrap so the picker/switcher work regardless of how the app was
  // launched.
  const enginesQuery = useToolQuery<EnginesResult>(["camunda7:engines"], CAMUNDA7_LIST_ENGINES, {})
  const engines = enginesQuery.data?.engines ?? data?.engines ?? []
  // The environment→engine map (single default group when none is configured)
  // — drives the sidebar switcher's optgroups.
  const engineGroups = groupEnginesByEnvironment(engines)

  // Active locale from the global ProfileGate (server root) — used for the
  // shell strings here; the rendered leaf widgets read it the same way. Theme is
  // applied document-wide by the ProfileGate too, so the cockpit stays unaware.
  const locale = useLocale()
  const { context } = useHandOff()

  // The host root's full widget registry (HostWidgetsProvider) merged under
  // this module's own widgets: composed views (the settings tab) reference
  // other modules' section widgets by raw id (tier-2). Own ids always win, and
  // a host without the provider degrades to camunda7-only rendering.
  const hostWidgets = useHostWidgets()
  const cockpitWidgets = { ...hostWidgets, ...camunda7BaseWidgets }

  const [{ scope, stack, goneEngineId }, dispatch] = useCockpitState(data, engines)

  // The cross-engine view is an analytics feature (landscape + fleet analyses
  // need Prometheus) — offered only once the module is confirmed active, both
  // on the landing and in the sidebar. Per-engine health stays on the picker.
  const offerFleet = useAnalyticsActive() && engines.length > 1
  const openFleet = offerFleet ? () => dispatch({ type: "to-fleet" }) : undefined

  // Pick (or switch) the active engine — navigation only, side-effect free.
  // The cockpit threads `engine` into every view, and its model context and
  // every Ask-AI hand-off carry it as an id (the module's server instructions
  // tell the model to pass it on); the caller's saved
  // default engine (which retargets every later engine-less tool call)
  // changes only through an explicit action: the settings page or
  // `camunda7_select_engine`.
  const enterEngine = (id: string) => dispatch({ type: "enter-engine", id })
  const switchEngine = (id: string) => dispatch({ type: "switch-engine", id })

  // Deterministic, client-side navigation — every view is hosted in-app and
  // routed in-place by the reducer (no LLM round-trip, no chat handoff). Nav
  // intents from child widgets ARE reducer actions.
  const navigate: OnNavigate = dispatch

  // ── Loading / error / empty ───────────────────────────────────────────────
  // Only a truly empty engine list blocks the cockpit: with bootstrap engines
  // from open_cockpit we proceed even if the engines query failed, and without
  // a query transport the state must resolve instead of loading forever.
  if (engines.length === 0) {
    return <EnginesEmptyState hasTransport={!!queryCallTool} enginesQuery={enginesQuery} />
  }

  if (scope.kind === "landing") {
    return (
      <>
        {/* The model hears the picker as the picker — no engine is in scope. */}
        <HostModelContext content={context(landingContext(engineGroups))}>{null}</HostModelContext>
        <LandingChooser
          engines={engines}
          onEnterEngine={enterEngine}
          onOpenFleet={openFleet}
          notice={<EngineGoneNotice engineId={goneEngineId} />}
        />
      </>
    )
  }

  // ── Cross-engine (fleet) mode ─────────────────────────────────────────────
  if (scope.kind === "fleet") {
    return (
      <WidgetShell>
        <HostModelContext content={context(fleetContext(engineGroups))}>{null}</HostModelContext>
        {engines.length > 1 && (
          <nav
            aria-label={translator(locale, "cockpit.aria.breadcrumb")}
            className="text-muted-foreground mb-4 flex items-center gap-1.5 text-sm"
          >
            <button
              type="button"
              onClick={() => dispatch({ type: "to-landing" })}
              className="hover:text-foreground focus-visible:ring-ring rounded outline-none focus-visible:ring-2"
            >
              {translator(locale, "cockpit.crumb.cockpit")}
            </button>
            <span aria-hidden="true">›</span>
            <span className="text-foreground font-medium">
              {translator(locale, "cockpit.crumb.fleet")}
            </span>
          </nav>
        )}
        <FleetView engines={engines} onEnterEngine={enterEngine} widgets={cockpitWidgets} />
      </WidgetShell>
    )
  }

  const engineId = scope.engineId
  // The reducer never empties the stack (pop clamps to one element).
  const current = stack[stack.length - 1]
  // The sidebar highlights the ROOT of the trail — the section the user drilled
  // in from stays active (every stack starts at a top section).
  const rootSection = stack[0].section
  const activeSection: TopSection =
    rootSection === "incidents" || rootSection === "settings" ? rootSection : "overview"

  return (
    <WidgetShell>
      <HostModelContext content={context(cockpitContext(engineId, current))}>
        {null}
      </HostModelContext>
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <aside className="flex flex-col gap-3 md:w-48 md:shrink-0">
          <nav
            aria-label={translator(locale, "cockpit.aria.sections")}
            className="flex flex-row flex-wrap gap-1 md:flex-col"
          >
            {SECTIONS.map((s) => {
              const isActive = activeSection === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => dispatch(s.intent)}
                  className={`focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-2 ${
                    isActive
                      ? "bg-m-blue-soft text-m-blue font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span aria-hidden="true">{s.icon}</span>
                  {translator(locale, `cockpit.section.${s.id}`)}
                </button>
              )
            })}
          </nav>

          <CockpitRefreshButton />

          {engines.length > 1 && (
            <EngineSwitcher
              engineId={engineId}
              engineGroups={engineGroups}
              onSwitch={switchEngine}
              onOpenFleet={openFleet}
            />
          )}
        </aside>

        <main className="min-w-0 flex-1">
          <EngineGoneNotice engineId={goneEngineId} />
          {/* Roots (stack of one) render no trail — NavBreadcrumb handles that. */}
          <NavBreadcrumb
            stack={stack}
            locale={locale}
            onPop={(to) => dispatch({ type: "pop", to })}
          />

          {/* Every view is a layout of self-fetching widgets rendered through the
              toolkit renderer. The NavProvider is the client-side navigation
              seam: widgets call `useNav()`, which resolves to this in-app router
              instead of a chat follow-up. */}
          <NavProvider value={navigate}>
            <WidgetRenderer
              layout={filterLayoutToWidgets(
                cockpitViews[current.section](buildViewParams(current, engineId), {
                  // Composed views (the settings tab) assemble their rows from
                  // what this host actually registered — including modules this
                  // package has never heard of.
                  widgetIds: Object.keys(cockpitWidgets),
                }),
                cockpitWidgets,
              )}
              keys={{}}
              errors={[]}
              widgets={cockpitWidgets}
            />
          </NavProvider>
        </main>
      </div>
    </WidgetShell>
  )
}
