import { useEffect, useReducer } from "react"
import { ModelContext, useWidget } from "mcp-use/react"
import { useCallTool, useLocale, useToolQuery } from "@miragon/mcp-toolkit-ui"
import { WidgetRenderer } from "@miragon/mcp-toolkit-ui/app"
import { ViewDataState, WidgetShell, truncate } from "@miragon-ai/widget-shell/widgets"
import type { CockpitAppData } from "../../view-models.js"
import { NavProvider, type NavIntent, type OnNavigate } from "../navigation.js"
import { camunda7BaseWidgets } from "../registry.js"
import { translator } from "../../messages/index.js"
import { cockpitViews, type ViewParams } from "./views.js"
import { FleetView } from "./fleet-view.js"

export type { CockpitAppData }

interface EnginesResult {
  engines: Array<{ id: string }>
  currentSelection: string | null
  /** Profile default engine — landing hint when nothing is sticky-selected yet. */
  profileDefaultEngineId?: string | null
}

/** Internal, client-side view state — the reducer's mapping of {@link NavIntent}. */
type CockpitView =
  | { section: "overview" }
  | { section: "incidents" }
  | { section: "settings" }
  | {
      section: "cluster-detail"
      activityId: string
      incidentType: string
      messageSignature?: string
    }
  | { section: "process-detail"; processDefinitionKey: string; focus?: "incidents" }
  | { section: "process-instances"; processDefinitionKey: string }
  | { section: "instance-detail"; processInstanceId: string }
  | { section: "incident-detail"; incidentId: string }

type TopSection = "overview" | "incidents" | "settings"

const SECTIONS: Array<{ id: TopSection; intent: NavIntent; icon: string }> = [
  { id: "overview", intent: { type: "process-list" }, icon: "▦" },
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

/**
 * Map the public {@link NavIntent} contract onto a view. Compile-checked
 * exhaustive: a new intent variant fails the `satisfies never` below instead of
 * silently no-oping in the cockpit.
 */
function intentToView(intent: NavIntent): CockpitView {
  switch (intent.type) {
    case "process-list":
      return { section: "overview" }
    case "incidents":
      return { section: "incidents" }
    case "settings":
      return { section: "settings" }
    case "cluster-detail":
      return {
        section: "cluster-detail",
        activityId: intent.activityId,
        incidentType: intent.incidentType,
        messageSignature: intent.messageSignature,
      }
    case "process-detail":
      return { section: "process-detail", processDefinitionKey: intent.processDefinitionKey }
    case "process-instances":
      return { section: "process-instances", processDefinitionKey: intent.processDefinitionKey }
    // The "process-incidents" intent is a KEPT public contract (widgets emit
    // it) — it lands on the SAME definition view, focused on incidents.
    case "process-incidents":
      return {
        section: "process-detail",
        processDefinitionKey: intent.processDefinitionKey,
        focus: "incidents",
      }
    case "instance-detail":
      return { section: "instance-detail", processInstanceId: intent.processInstanceId }
    case "incident-detail":
      return { section: "incident-detail", incidentId: intent.incidentId }
  }
  return intent satisfies never
}

/**
 * Identity of a view on the stack — navigating to a view that is already in the
 * trail pops back to it instead of growing an A→B→A loop. Deliberately IGNORES
 * the definition view's `focus`: detail → incidents-focus on the same
 * definition updates the stack entry in place instead of stacking a twin.
 */
function viewKey(view: CockpitView): string {
  switch (view.section) {
    case "cluster-detail":
      return `cluster-detail:${view.activityId}:${view.incidentType}:${view.messageSignature ?? ""}`
    case "process-detail":
    case "process-instances":
      return `${view.section}:${view.processDefinitionKey}`
    case "instance-detail":
      return `instance-detail:${view.processInstanceId}`
    case "incident-detail":
      return `incident-detail:${view.incidentId}`
    default:
      return view.section
  }
}

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
    case "pop": {
      const to = Math.min(action.to ?? state.stack.length - 2, state.stack.length - 1)
      return { ...state, stack: state.stack.slice(0, Math.max(to, 0) + 1) }
    }
    default: {
      const view = intentToView(action)
      // Top sections are roots, not drills — selecting one resets the trail.
      if (isTopSection(view.section)) return { ...state, stack: [view] }
      const key = viewKey(view)
      const existing = state.stack.findIndex((v) => viewKey(v) === key)
      if (existing >= 0) {
        // Pop back to the existing entry, but adopt the incoming view's
        // params — same identity, possibly a different focus (e.g.
        // detail → incidents-focus on the same definition).
        const stack = state.stack.slice(0, existing + 1)
        stack[existing] = view
        return { ...state, stack }
      }
      return { ...state, stack: [...state.stack, view] }
    }
  }
}

function crumbLabel(view: CockpitView, locale: string): string {
  const tr = (key: string, params?: Record<string, unknown>) => translator(locale, key, params)
  switch (view.section) {
    case "overview":
      return tr("cockpit.crumb.overview")
    case "incidents":
      return tr("cockpit.crumb.incidents")
    case "settings":
      return tr("cockpit.section.settings")
    case "process-detail":
      return view.processDefinitionKey
    case "process-instances":
      return tr("cockpit.crumb.instances")
    case "instance-detail":
      return tr("cockpit.crumb.instance", { id: truncate(view.processInstanceId, 8) })
    case "incident-detail":
      return tr("cockpit.crumb.incident", { id: truncate(view.incidentId, 8) })
    case "cluster-detail":
      return tr("cockpit.crumb.cluster", { activity: view.activityId })
  }
}

export function CockpitApp({ data }: { data: CockpitAppData | null }) {
  const { requestDisplayMode, callTool } = useWidget()

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

  const [{ scope, stack }, dispatch] = useReducer(cockpitReducer, INITIAL_STATE)

  // App-like surface: ask the host for fullscreen once on mount.
  useEffect(() => {
    void requestDisplayMode("fullscreen").catch(() => {
      /* host may decline; inline still works */
    })
  }, [requestDisplayMode])

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
    return (
      <WidgetShell>
        <ViewDataState
          loading={!!queryCallTool && !enginesQuery.isError && enginesQuery.data === undefined}
          error={enginesQuery.error}
          loadingText={translator(locale, "cockpit.loading.engines")}
          emptyText={translator(locale, "cockpit.empty.engines")}
          className="text-muted-foreground p-6 text-sm"
        />
      </WidgetShell>
    )
  }

  if (scope.kind === "landing") {
    // A single engine auto-enters via the effect above — bridge the one render
    // before it lands.
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
                    onClick={() => enterEngine(e.id)}
                    className="border-border bg-background text-foreground hover:bg-muted focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2"
                  >
                    {e.id} <span aria-hidden>→</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: "to-fleet" })}
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

  // ── Cross-engine (fleet) mode ─────────────────────────────────────────────
  if (scope.kind === "fleet") {
    return (
      <WidgetShell>
        <ModelContext
          content={`Support is in the consolidated CIB Seven cockpit in CROSS-ENGINE (fleet) mode across engines: ${engines
            .map((e) => e.id)
            .join(
              ", ",
            )}. Offer cross-engine analyses (compare engines, fleet-wide failure & performance) via the analytics tools; drilling into an engine switches to that engine's single-engine cockpit.`}
        />
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

  // The selected entity of the active view, surfaced in the app-level model
  // context so drill-down views whose widgets carry no leaf <ModelContext>
  // still resolve "this incident/process" follow-up questions correctly.
  const selectedEntity =
    "incidentId" in current
      ? ` Selected incident: ${current.incidentId}.`
      : "processInstanceId" in current
        ? ` Selected process instance: ${current.processInstanceId}.`
        : "processDefinitionKey" in current
          ? ` Selected process definition: ${current.processDefinitionKey}.`
          : ""

  // Flatten the current route + resolved engine into the params bag every view
  // layout reads from. Each view picks only the ids it needs (see views.ts).
  const viewParams: ViewParams = {
    engine: engineId,
    processDefinitionKey:
      "processDefinitionKey" in current ? current.processDefinitionKey : undefined,
    processInstanceId: "processInstanceId" in current ? current.processInstanceId : undefined,
    incidentId: "incidentId" in current ? current.incidentId : undefined,
    activityId: "activityId" in current ? current.activityId : undefined,
    incidentType: "incidentType" in current ? current.incidentType : undefined,
    messageSignature: "messageSignature" in current ? current.messageSignature : undefined,
    focus: "focus" in current ? current.focus : undefined,
  }

  return (
    <WidgetShell>
      <ModelContext
        content={`Support is in the consolidated CIB Seven cockpit (camunda7_open_cockpit) on engine "${engineId}". Current view: ${current.section}.${selectedEntity} Navigation is client-side; drill definitions → instances → instance. Offer agentic help (analyze incident, prepare modification/migration, create ticket) when relevant.`}
      />
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
                  className={`focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 ${
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
                className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2"
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
          {/* The breadcrumb IS the stack — every crumb pops back to the view it
              names, so drilling instance → back → next instance never re-drills
              from the top. Roots (stack of one) render no trail. */}
          {stack.length > 1 && (
            <nav
              aria-label={translator(locale, "cockpit.aria.breadcrumb")}
              className="text-muted-foreground mb-4 flex flex-wrap items-center gap-1.5 text-sm"
            >
              {stack.map((v, i) => {
                const label = crumbLabel(v, locale)
                return (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    {i > 0 && <span aria-hidden="true">›</span>}
                    {i < stack.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "pop", to: i })}
                        className="hover:text-foreground focus-visible:ring-ring rounded outline-none focus-visible:ring-2"
                      >
                        {label}
                      </button>
                    ) : (
                      <span className="text-foreground font-medium">{label}</span>
                    )}
                  </span>
                )
              })}
            </nav>
          )}

          {/* Every view is a layout of self-fetching widgets rendered through the
              toolkit renderer. The NavProvider is the client-side navigation
              seam: widgets call `useNav()`, which resolves to this in-app router
              instead of a chat follow-up. */}
          <NavProvider value={navigate}>
            <WidgetRenderer
              layout={cockpitViews[current.section](viewParams)}
              keys={{}}
              errors={[]}
              widgets={camunda7BaseWidgets}
            />
          </NavProvider>
        </main>
      </div>
    </WidgetShell>
  )
}
