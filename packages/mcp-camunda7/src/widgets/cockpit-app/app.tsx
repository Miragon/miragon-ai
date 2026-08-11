import { useEffect, useReducer } from "react"
import { useCallTool, useLocale, useToolQuery } from "@miragon/mcp-toolkit-ui"
import { HostModelContext, WidgetRenderer, useHostBridge } from "@miragon/mcp-toolkit-ui/app"
import { ViewDataState, WidgetShell, useHostWidgets } from "@miragon-ai/widget-shell/widgets"
import type { CockpitAppData } from "../../view-models.js"
import { NavProvider, type NavIntent, type OnNavigate } from "../navigation.js"
import {
  buildViewParams,
  describeCurrentView,
  intentToView,
  popTo,
  pushView,
  type CockpitView,
} from "../nav-core.js"
import { camunda7BaseWidgets } from "../registry.js"
import { translator } from "../../messages/index.js"
import { NavBreadcrumb } from "./breadcrumb.js"
import { cockpitViews, filterLayoutToWidgets } from "./views.js"
import { FleetView } from "./fleet-view.js"

export type { CockpitAppData }

interface EnginesResult {
  engines: Array<{ id: string }>
  currentSelection: string | null
  /** Profile default engine — landing hint when nothing is sticky-selected yet. */
  profileDefaultEngineId?: string | null
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
 * when more than one engine is configured.
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
}

type CockpitAction =
  | NavIntent
  | { type: "enter-engine"; id: string }
  | { type: "switch-engine"; id: string }
  | { type: "to-fleet" }
  | { type: "to-landing" }
  | { type: "pop"; to?: number }

const ROOT_STACK: CockpitView[] = [{ section: "overview" }]
const INITIAL_STATE: CockpitState = { scope: { kind: "landing" }, stack: ROOT_STACK }

function cockpitReducer(state: CockpitState, action: CockpitAction): CockpitState {
  switch (action.type) {
    case "enter-engine":
    case "switch-engine":
      // Same transition from two origins (chooser/fleet vs. in-app switcher):
      // an engine change always restarts at the overview — drill state carried
      // over would resolve ids that belong to another engine.
      return { scope: { kind: "engine", engineId: action.id }, stack: ROOT_STACK }
    case "to-fleet":
      return { scope: { kind: "fleet" }, stack: ROOT_STACK }
    case "to-landing":
      return { scope: { kind: "landing" }, stack: ROOT_STACK }
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

function EnginesEmptyState({
  hasTransport,
  enginesQuery,
}: {
  hasTransport: boolean
  enginesQuery: { isError: boolean; error: Error | null; data: unknown }
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
      />
    </WidgetShell>
  )
}

function LandingChooser({
  engines,
  onEnterEngine,
  onOpenFleet,
}: {
  engines: Array<{ id: string }>
  onEnterEngine: (id: string) => void
  onOpenFleet: () => void
}) {
  const locale = useLocale()
  // A single engine auto-enters via the effect in CockpitApp — bridge the one
  // render before it lands.
  if (engines.length === 1) {
    return (
      <WidgetShell>
        <div className="text-muted-foreground p-6 text-sm">
          {translator(locale, "cockpit.loading.engines")}
        </div>
      </WidgetShell>
    )
  }
  // The landing chooser: with more than one engine, Open Cockpit offers two
  // ways in — operate a single engine, or run cross-engine analyses.
  return (
    <WidgetShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 py-10">
        <div className="text-center">
          <h1 className="text-foreground text-2xl font-bold">
            {translator(locale, "cockpit.landing.title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {translator(locale, "cockpit.landing.subtitle", { count: engines.length })}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-5">
            <div className="bg-m-blue-soft text-m-blue grid size-10 place-items-center rounded-lg text-lg">
              ▦
            </div>
            <div>
              <h2 className="text-foreground font-semibold">
                {translator(locale, "cockpit.landing.operate.title")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {translator(locale, "cockpit.landing.operate.desc")}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {engines.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onEnterEngine(e.id)}
                  className="border-border bg-background text-foreground hover:bg-muted focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2"
                >
                  {e.id} <span aria-hidden>→</span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenFleet}
            className="border-border bg-card hover:bg-muted focus-visible:ring-ring flex flex-col gap-3 rounded-xl border p-5 text-left outline-none focus-visible:ring-2"
          >
            <div className="bg-m-blue-soft text-m-blue grid size-10 place-items-center rounded-lg text-lg">
              ⤧
            </div>
            <div>
              <h2 className="text-foreground font-semibold">
                {translator(locale, "cockpit.landing.fleet.title")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {translator(locale, "cockpit.landing.fleet.desc")}
              </p>
            </div>
            <span className="text-m-blue mt-1 text-sm font-medium">
              {translator(locale, "cockpit.landing.fleet.open")} <span aria-hidden>→</span>
            </span>
          </button>
        </div>
      </div>
    </WidgetShell>
  )
}

export function CockpitApp({ data }: { data: CockpitAppData | null }) {
  // Host-portable tool transport for imperative calls (sticky engine select).
  // Requesting fullscreen is no longer a widget concern since mcp-use 2.x:
  // the HostBridge carries no `requestDisplayMode`, and the app shell
  // (`McpAppView`) owns the fullscreen affordance instead.
  const { callTool } = useHostBridge()

  // The query transport (AppQueryProvider). Absent when the host wires no
  // callTool — then every useToolQuery stays disabled (pending forever), so the
  // loading state below must not wait on the engines query.
  const queryCallTool = useCallTool()

  // Authoritative engine source: the stable `camunda7_engine` tool's "list"
  // action (needs no selection itself). Decoupled from the open_cockpit
  // bootstrap so the picker/switcher work regardless of how the app was
  // launched.
  const enginesQuery = useToolQuery<EnginesResult>(["camunda7:engines"], "camunda7_engine", {
    action: "list",
  })
  const engines = enginesQuery.data?.engines ?? data?.engines ?? []

  // Active locale from the global ProfileGate (server root) — used for the
  // shell strings here; the rendered leaf widgets read it the same way. Theme is
  // applied document-wide by the ProfileGate too, so the cockpit stays unaware.
  const locale = useLocale()

  // The host root's full widget registry (HostWidgetsProvider) merged under
  // this module's own widgets: composed views (the settings tab) reference
  // other modules' section widgets by raw id (tier-2). Own ids always win, and
  // a host without the provider degrades to camunda7-only rendering.
  const hostWidgets = useHostWidgets()
  const cockpitWidgets = { ...hostWidgets, ...camunda7BaseWidgets }

  const [{ scope, stack }, dispatch] = useReducer(cockpitReducer, INITIAL_STATE)

  // A single configured engine skips the landing chooser — one-shot auto-enter
  // once the engine list resolves.
  const soleEngineId = engines.length === 1 ? engines[0].id : null
  useEffect(() => {
    if (scope.kind === "landing" && soleEngineId) {
      dispatch({ type: "enter-engine", id: soleEngineId })
    }
  }, [scope.kind, soleEngineId])

  // Pick (or switch) the active engine. The cockpit threads `engine` into its
  // own views explicitly, but we ALSO make the selection sticky for the session
  // so delegated/agentic paths (incidents, "ask AI" actions) use the same engine.
  function stickySelect(id: string) {
    void callTool("camunda7_engine", { action: "select", engineId: id }).catch(() => {
      /* override on each call still works even if sticky selection fails */
    })
  }
  function enterEngine(id: string) {
    dispatch({ type: "enter-engine", id })
    stickySelect(id)
  }
  function switchEngine(id: string) {
    dispatch({ type: "switch-engine", id })
    stickySelect(id)
  }

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
      <LandingChooser
        engines={engines}
        onEnterEngine={enterEngine}
        onOpenFleet={() => dispatch({ type: "to-fleet" })}
      />
    )
  }

  // ── Cross-engine (fleet) mode ─────────────────────────────────────────────
  if (scope.kind === "fleet") {
    return (
      <WidgetShell>
        <HostModelContext
          content={`Support is in the consolidated CIB Seven cockpit in CROSS-ENGINE (fleet) mode across engines: ${engines
            .map((e) => e.id)
            .join(
              ", ",
            )}. Offer cross-engine analyses (compare engines, fleet-wide failure & performance) via the analytics tools; drilling into an engine switches to that engine's single-engine cockpit.`}
        >
          {null}
        </HostModelContext>
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
        <FleetView engines={engines} onEnterEngine={enterEngine} />
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
      <HostModelContext
        content={`Support is in the consolidated CIB Seven cockpit (camunda7_open_cockpit) on engine "${engineId}". ${describeCurrentView(current)} Navigation is client-side; drill definitions → instances → instance. Offer agentic help (analyze incident, prepare modification/migration, create ticket) when relevant.`}
      >
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

          {engines.length > 1 && (
            <div className="border-border mt-1 flex flex-col gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => dispatch({ type: "to-fleet" })}
                className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-2"
              >
                <span aria-hidden="true">⤧</span>
                {translator(locale, "cockpit.nav.crossEngine")}
              </button>
              <label className="text-muted-foreground flex flex-col gap-1 px-3 text-[11px] font-medium">
                {translator(locale, "cockpit.nav.engine")}
                <select
                  aria-label={translator(locale, "cockpit.aria.activeEngine")}
                  value={engineId}
                  onChange={(e) => switchEngine(e.target.value)}
                  className="border-border bg-background text-foreground h-8 rounded-md border px-2 text-xs"
                >
                  {engines.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </aside>

        <main className="min-w-0 flex-1">
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
                cockpitViews[current.section](buildViewParams(current, engineId)),
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
