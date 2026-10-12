import { useReducer, type ReactNode } from "react"
import {
  Button,
  cn,
  FOCUS_RING,
  useCallTool,
  useLocale,
  useToolQuery,
} from "@miragon/mcp-toolkit-ui"
import { HostModelContext, WidgetRenderer } from "@miragon/mcp-toolkit-ui/app"
import {
  AppEmptyState,
  Icon,
  NativeSelect,
  ViewDataState,
  WidgetShell,
  useHostWidgets,
  useResetOnChange,
  type LucideIcon,
} from "@miragon-ai/widget-shell/widgets"
import {
  ArrowLeftRight,
  ChevronRight,
  LayoutDashboard,
  Settings,
  TriangleAlert,
} from "lucide-react"
import type { CockpitAppData } from "../../view-models.js"
import { groupEnginesByEnvironment } from "../../lib/environments.js"
import { EngineChromeProvider, EnvironmentChip, environmentIn } from "../lib/engine-context.js"
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

const SECTIONS: Array<{ id: TopSection; intent: NavIntent; icon: LucideIcon }> = [
  { id: "overview", intent: { type: "overview" }, icon: LayoutDashboard },
  { id: "incidents", intent: { type: "incidents" }, icon: TriangleAlert },
  { id: "settings", intent: { type: "settings" }, icon: Settings },
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
 * The engine the cockpit operates, as its head shows it (#322 U4): the
 * environment as a text chip ("PROD") and the engine, a select over the
 * environment→engine map when there is more than one (optgroups by
 * environment, flat for a single one).
 */
function EngineSwitch({
  engineId,
  environment,
  engineGroups,
  onSwitch,
}: {
  engineId: string
  environment: string | null
  engineGroups: Array<{ id: string; engines: Array<{ id: string }> }>
  onSwitch: (id: string) => void
}) {
  const locale = useLocale()
  const engines = engineGroups.flatMap((g) => g.engines)
  return (
    <div data-slot="engine-context" className="flex min-w-0 items-center gap-2">
      {environment && <EnvironmentChip environment={environment} />}
      {engines.length > 1 ? (
        <NativeSelect
          aria-label={translator(locale, "cockpit.aria.activeEngine")}
          value={engineId}
          onChange={(e) => onSwitch(e.target.value)}
          className="h-8 max-w-56 font-semibold"
        >
          {engineGroups.length > 1
            ? engineGroups.map((g) => (
                <optgroup key={g.id} label={g.id.toUpperCase()}>
                  {g.engines.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id}
                    </option>
                  ))}
                </optgroup>
              ))
            : engines.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.id}
                </option>
              ))}
        </NativeSelect>
      ) : (
        <span className="text-dense text-foreground truncate font-semibold">{engineId}</span>
      )}
    </div>
  )
}

/**
 * The cockpit's head (#322 U20): ONE compact row — the section switch on the
 * left; the way across engines, the engine with its environment and the one
 * Refresh on the right. It replaces the sidebar that cost an inline frame
 * some 200 px before the first content. Wraps only when the frame is
 * narrower than its content; the cross-engine label shows from 56rem of head
 * width, below it the button keeps its name in `aria-label`.
 */
function CockpitHead({
  activeSection,
  onSection,
  engineSwitch,
  onOpenFleet,
}: {
  activeSection: TopSection
  onSection: (intent: NavIntent) => void
  engineSwitch: ReactNode
  onOpenFleet?: () => void
}) {
  const locale = useLocale()
  const crossEngine = translator(locale, "cockpit.nav.crossEngine")
  return (
    <div className="border-border @container mb-4 border-b pb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav
          aria-label={translator(locale, "cockpit.aria.sections")}
          className="flex flex-wrap items-center gap-1"
        >
          {SECTIONS.map((s) => {
            const isActive = activeSection === s.id
            return (
              <button
                key={s.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSection(s.intent)}
                className={cn(
                  "text-dense inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors",
                  FOCUS_RING,
                  isActive
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon icon={s.icon} />
                {translator(locale, `cockpit.section.${s.id}`)}
              </button>
            )
          })}
        </nav>
        <div className="ms-auto flex min-w-0 flex-wrap items-center gap-2">
          {onOpenFleet && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenFleet}
              aria-label={crossEngine}
              title={crossEngine}
            >
              <Icon icon={ArrowLeftRight} />
              <span className="hidden @4xl:inline">{crossEngine}</span>
            </Button>
          )}
          {engineSwitch}
          <CockpitRefreshButton />
        </div>
      </div>
    </div>
  )
}

/**
 * The section the head highlights: the ROOT of the trail — the section the
 * user drilled in from stays active (every stack starts at a top section).
 */
function activeSectionOf(stack: CockpitView[]): TopSection {
  const root = stack[0].section
  return root === "incidents" || root === "settings" ? root : "overview"
}

/**
 * The cross-engine view's trail: "Alle Engines" (the chooser) and itself,
 * the current page. The cockpit offers the view only with more than one
 * engine, so the chooser is always there to go back to.
 */
function FleetCrumbs({ locale, onLanding }: { locale: string; onLanding: () => void }) {
  return (
    <nav
      aria-label={translator(locale, "cockpit.aria.breadcrumb")}
      className="text-muted-foreground text-dense mb-4 flex items-center gap-1.5"
    >
      <button
        type="button"
        onClick={onLanding}
        className={cn("hover:text-foreground rounded", FOCUS_RING)}
      >
        {translator(locale, "cockpit.crumb.allEngines")}
      </button>
      <Icon icon={ChevronRight} dense />
      <span aria-current="page" className="text-foreground font-medium">
        {translator(locale, "cockpit.crumb.fleet")}
      </span>
    </nav>
  )
}

/** Why the cockpit left the engine it was on: that engine left the engine list. Nothing without one. */
function EngineGoneNotice({ engineId }: { engineId: string | null }) {
  const locale = useLocale()
  if (!engineId) return null
  return (
    <p role="status" className="text-muted-foreground text-dense mb-3">
      {translator(locale, "cockpit.engineGone", { engineId })}
    </p>
  )
}

/**
 * No engine to operate: loading or a failed engine list are the kit's view
 * states; an empty one is the app-level "no engines" surface — the Miragon
 * signature (Komet, "Miragon AI") over what to do (#322 U15).
 */
function EnginesEmptyState({
  hasTransport,
  enginesQuery,
}: {
  hasTransport: boolean
  enginesQuery: { isError: boolean; error: Error | null; data: unknown; refetch: () => unknown }
}) {
  const locale = useLocale()
  const loading = hasTransport && !enginesQuery.isError && enginesQuery.data === undefined
  if (loading || enginesQuery.error) {
    return (
      <WidgetShell>
        <ViewDataState
          loading={loading}
          error={enginesQuery.error}
          loadingText={translator(locale, "cockpit.loading.engines")}
          emptyText={translator(locale, "cockpit.empty.engines")}
          onRetry={() => void enginesQuery.refetch()}
          retryLabel={translator(locale, "viewState.retry")}
        />
      </WidgetShell>
    )
  }
  return (
    <WidgetShell>
      <AppEmptyState
        title={translator(locale, "cockpit.empty.enginesTitle")}
        description={translator(locale, "cockpit.empty.engines")}
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
          defaultEngineId={enginesQuery.data?.defaultEngineId ?? null}
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
        <FleetCrumbs locale={locale} onLanding={() => dispatch({ type: "to-landing" })} />
        <FleetView engines={engines} onEnterEngine={enterEngine} widgets={cockpitWidgets} />
      </WidgetShell>
    )
  }

  const engineId = scope.engineId
  // The reducer never empties the stack (pop clamps to one element).
  const current = stack[stack.length - 1]
  const activeSection = activeSectionOf(stack)

  const environment = environmentIn(engines, engineId)

  return (
    <WidgetShell>
      <HostModelContext content={context(cockpitContext(engineId, current))}>
        {null}
      </HostModelContext>
      <CockpitHead
        activeSection={activeSection}
        onSection={(intent) => dispatch(intent)}
        onOpenFleet={openFleet}
        engineSwitch={
          <EngineSwitch
            engineId={engineId}
            environment={environment}
            engineGroups={engineGroups}
            onSwitch={switchEngine}
          />
        }
      />

      <main className="min-w-0">
        <EngineGoneNotice engineId={goneEngineId} />
        {/* "Alle Engines" leads back to the chooser (#322 U15) whenever there
            is more than one engine to choose from; a root view with a single
            engine renders no trail (NavBreadcrumb handles that). */}
        <NavBreadcrumb
          stack={stack}
          locale={locale}
          rootLabel={
            engines.length > 1 ? translator(locale, "cockpit.crumb.allEngines") : undefined
          }
          onPop={(to) => dispatch(to < 0 ? { type: "to-landing" } : { type: "pop", to })}
        />

        {/* Every view is a layout of self-fetching widgets rendered through the
            toolkit renderer. The NavProvider is the client-side navigation
            seam: widgets call `useNav()`, which resolves to this in-app router
            instead of a chat follow-up. The head names the engine, so the
            views leave it out of their own meta line (EngineChromeProvider). */}
        <NavProvider value={navigate}>
          <EngineChromeProvider>
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
          </EngineChromeProvider>
        </NavProvider>
      </main>
    </WidgetShell>
  )
}
