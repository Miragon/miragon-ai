import { useEffect, useState } from "react"
import { ModelContext, useWidget } from "mcp-use/react"
import { useLocale, useToolQuery } from "@miragon/mcp-toolkit-ui"
import { WidgetRenderer } from "@miragon/mcp-toolkit-ui/app"
import { ViewDataState, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { CockpitAppData } from "../../view-models.js"
import { NavProvider, type NavIntent, type OnNavigate } from "../navigation.js"
import { camunda7BaseWidgets } from "../registry.js"
import { translator } from "../../messages/index.js"
import { cockpitViews, type ViewParams } from "./views.js"
import { FleetView } from "./fleet-view.js"

export type { CockpitAppData }

/**
 * Top-level cockpit scope. Open Cockpit offers two ways in: operate a single
 * engine, or run cross-engine ("fleet") analyses. `landing` is the chooser shown
 * when more than one engine is configured.
 */
type CockpitMode = "landing" | "engine" | "fleet"

interface EnginesResult {
  engines: Array<{ id: string }>
  currentSelection: string | null
  /** Profile default engine — landing hint when nothing is sticky-selected yet. */
  profileDefaultEngineId?: string | null
}

/** Internal, client-side view state — mirrors NavIntent but drives the router. */
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
  | { section: "process-detail"; processDefinitionKey: string }
  | { section: "process-instances"; processDefinitionKey: string }
  | { section: "process-incidents"; processDefinitionKey: string }
  | { section: "instance-detail"; processInstanceId: string }
  | { section: "incident-detail"; incidentId: string }

type TopSection = "overview" | "incidents" | "settings"

const SECTIONS: Array<{ id: TopSection; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "▦" },
  { id: "incidents", label: "Incidents", icon: "⚠" },
  { id: "settings", label: "Settings", icon: "⚙" },
]

function topSectionOf(view: CockpitView): TopSection {
  switch (view.section) {
    case "process-detail":
    case "process-instances":
    case "instance-detail":
      return "overview"
    case "process-incidents":
    case "incident-detail":
      return "incidents"
    // The cluster drill comes from the overview's failure clusters and its
    // breadcrumb anchors there — keep the sidebar consistent with that.
    case "cluster-detail":
      return "overview"
    default:
      return view.section
  }
}

interface Crumb {
  label: string
  view?: CockpitView
}

function breadcrumbOf(view: CockpitView, locale: string): Crumb[] {
  const tr = (key: string, params?: Record<string, unknown>) => translator(locale, key, params)
  switch (view.section) {
    case "process-detail":
      return [
        { label: tr("cockpit.crumb.overview"), view: { section: "overview" } },
        { label: view.processDefinitionKey },
      ]
    case "process-instances":
      return [
        { label: tr("cockpit.crumb.overview"), view: { section: "overview" } },
        {
          label: view.processDefinitionKey,
          view: { section: "process-detail", processDefinitionKey: view.processDefinitionKey },
        },
        { label: tr("cockpit.crumb.instances") },
      ]
    case "process-incidents":
      return [
        { label: tr("cockpit.crumb.incidents"), view: { section: "incidents" } },
        { label: view.processDefinitionKey },
      ]
    case "incident-detail":
      return [
        { label: tr("cockpit.crumb.incidents"), view: { section: "incidents" } },
        { label: tr("cockpit.crumb.incident", { id: view.incidentId.slice(0, 8) }) },
      ]
    case "cluster-detail":
      return [
        { label: tr("cockpit.crumb.overview"), view: { section: "overview" } },
        { label: tr("cockpit.crumb.cluster", { activity: view.activityId }) },
      ]
    case "instance-detail":
      return [
        { label: tr("cockpit.crumb.overview"), view: { section: "overview" } },
        { label: tr("cockpit.crumb.instance", { id: view.processInstanceId.slice(0, 8) }) },
      ]
    default:
      return []
  }
}

export function CockpitApp({ data }: { data: CockpitAppData | null }) {
  const { requestDisplayMode, callTool } = useWidget()

  // Authoritative engine source: the stable `camunda7_engine` tool's "list"
  // action (needs no selection itself). Decoupled from the open_cockpit
  // bootstrap so the picker/switcher work regardless of how the app was
  // launched.
  const enginesQuery = useToolQuery<EnginesResult>(["camunda7:engines"], "camunda7_engine", {
    action: "list",
  })
  const engines = enginesQuery.data?.engines ?? data?.engines ?? []

  // Active locale from the global ProfileGate (gateway root) — used for the
  // shell strings here; the rendered leaf widgets read it the same way. Theme is
  // applied document-wide by the ProfileGate too, so the cockpit stays unaware.
  const locale = useLocale()

  const [picked, setPicked] = useState<string | null>(null)
  const [view, setView] = useState<CockpitView>({ section: "overview" })
  // Start on the chooser so Open Cockpit always offers both ways in (operate an
  // engine vs. cross-engine analyses). A single configured engine skips it (the
  // chooser only renders when engines.length > 1).
  const [mode, setMode] = useState<CockpitMode>("landing")

  // App-like surface: ask the host for fullscreen once on mount.
  useEffect(() => {
    void requestDisplayMode("fullscreen").catch(() => {
      /* host may decline; inline still works */
    })
  }, [requestDisplayMode])

  // Resolution order: explicit user pick → sticky session selection →
  // profile default engine → open_cockpit hint → the only engine (if just one).
  const engineId =
    picked ??
    enginesQuery.data?.currentSelection ??
    enginesQuery.data?.profileDefaultEngineId ??
    data?.engineId ??
    (engines.length === 1 ? engines[0].id : null)

  // Deterministic, client-side navigation — every view is hosted in-app and
  // routed in-place via the router below (no LLM round-trip, no chat handoff).
  const navigate: OnNavigate = (intent: NavIntent) => {
    switch (intent.type) {
      case "process-list":
        setView({ section: "overview" })
        return
      case "incidents":
        setView({ section: "incidents" })
        return
      case "cluster-detail":
        setView({
          section: "cluster-detail",
          activityId: intent.activityId,
          incidentType: intent.incidentType,
          messageSignature: intent.messageSignature,
        })
        return
      case "process-detail":
        setView({ section: "process-detail", processDefinitionKey: intent.processDefinitionKey })
        return
      case "process-instances":
        setView({ section: "process-instances", processDefinitionKey: intent.processDefinitionKey })
        return
      case "process-incidents":
        setView({ section: "process-incidents", processDefinitionKey: intent.processDefinitionKey })
        return
      case "instance-detail":
        setView({ section: "instance-detail", processInstanceId: intent.processInstanceId })
        return
      case "incident-detail":
        setView({ section: "incident-detail", incidentId: intent.incidentId })
        return
    }
  }

  // Pick (or switch) the active engine. The cockpit threads `engine` into its
  // own views explicitly, but we ALSO make the selection sticky for the session
  // so delegated/agentic paths (incidents, "ask AI" actions) use the same engine.
  function chooseEngine(id: string) {
    setPicked(id)
    setView({ section: "overview" })
    void callTool("camunda7_engine", { action: "select", engineId: id }).catch(() => {
      /* override on each call still works even if sticky selection fails */
    })
  }

  // Enter a single engine's cockpit from the landing chooser or the fleet view.
  function enterEngine(id: string) {
    chooseEngine(id)
    setMode("engine")
  }

  // ── Loading / error / empty ───────────────────────────────────────────────
  if (enginesQuery.isError || engines.length === 0) {
    return (
      <WidgetShell>
        <ViewDataState
          loading={enginesQuery.data === undefined}
          error={enginesQuery.error}
          loadingText={translator(locale, "cockpit.loading.engines")}
          emptyText={translator(locale, "cockpit.empty.engines")}
          className="text-muted-foreground p-6 text-sm"
        />
      </WidgetShell>
    )
  }

  // The landing chooser: with more than one engine, Open Cockpit offers two ways
  // in — operate a single engine, or run cross-engine analyses. A single engine
  // skips it. Shown whenever no engine scope is resolved yet.
  const needsChooser =
    engines.length > 1 && (mode === "landing" || (mode === "engine" && !engineId))
  if (needsChooser) {
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
              onClick={() => setMode("fleet")}
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
  if (mode === "fleet") {
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
            aria-label="Breadcrumb"
            className="text-muted-foreground mb-4 flex items-center gap-1.5 text-sm"
          >
            <button
              type="button"
              onClick={() => setMode("landing")}
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

  // Safety net: every multi-engine no-scope path is handled by the chooser above,
  // and a single engine resolves; this only guards the brief load window.
  if (!engineId) {
    return (
      <WidgetShell>
        <div className="text-muted-foreground p-6 text-sm">
          {translator(locale, "cockpit.loading.engines")}
        </div>
      </WidgetShell>
    )
  }

  const activeSection = topSectionOf(view)
  const crumbs = breadcrumbOf(view, locale)

  // The selected entity of the active view, surfaced in the app-level model
  // context so drill-down views whose widgets carry no leaf <ModelContext>
  // still resolve "this incident/process" follow-up questions correctly.
  const selectedEntity =
    "incidentId" in view
      ? ` Selected incident: ${view.incidentId}.`
      : "processInstanceId" in view
        ? ` Selected process instance: ${view.processInstanceId}.`
        : "processDefinitionKey" in view
          ? ` Selected process definition: ${view.processDefinitionKey}.`
          : ""

  // Flatten the current route + resolved engine into the params bag every view
  // layout reads from. Each view picks only the ids it needs (see views.ts).
  const viewParams: ViewParams = {
    engine: engineId,
    processDefinitionKey: "processDefinitionKey" in view ? view.processDefinitionKey : undefined,
    processInstanceId: "processInstanceId" in view ? view.processInstanceId : undefined,
    incidentId: "incidentId" in view ? view.incidentId : undefined,
    activityId: "activityId" in view ? view.activityId : undefined,
    incidentType: "incidentType" in view ? view.incidentType : undefined,
    messageSignature: "messageSignature" in view ? view.messageSignature : undefined,
  }

  return (
    <WidgetShell>
      <ModelContext
        content={`Support is in the consolidated CIB Seven cockpit (camunda7_open_cockpit) on engine "${engineId}". Current view: ${view.section}.${selectedEntity} Navigation is client-side; drill definitions → instances → instance. Offer agentic help (analyze incident, prepare modification/migration, create ticket) when relevant.`}
      />
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <aside className="flex flex-col gap-3 md:w-48 md:shrink-0">
          <nav aria-label="Cockpit sections" className="flex flex-row flex-wrap gap-1 md:flex-col">
            {SECTIONS.map((s) => {
              const isActive = activeSection === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setView({ section: s.id })}
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
                onClick={() => setMode("fleet")}
                className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2"
              >
                <span aria-hidden="true">⤧</span>
                {translator(locale, "cockpit.nav.crossEngine")}
              </button>
              <label className="text-muted-foreground flex flex-col gap-1 px-3 text-[11px] font-medium">
                {translator(locale, "cockpit.nav.engine")}
                <select
                  aria-label="Active engine"
                  value={engineId}
                  onChange={(e) => chooseEngine(e.target.value)}
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
          {crumbs.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="text-muted-foreground mb-4 flex flex-wrap items-center gap-1.5 text-sm"
            >
              {crumbs.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true">›</span>}
                  {c.view ? (
                    <button
                      type="button"
                      onClick={() => c.view && setView(c.view)}
                      className="hover:text-foreground focus-visible:ring-ring rounded outline-none focus-visible:ring-2"
                    >
                      {c.label}
                    </button>
                  ) : (
                    <span className="text-foreground font-medium">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}

          {/* Every view is a layout of self-fetching widgets rendered through the
              toolkit renderer. The NavProvider is the client-side navigation
              seam: widgets call `useNav()`, which resolves to this in-app router
              instead of a chat follow-up. */}
          <NavProvider value={navigate}>
            <WidgetRenderer
              layout={cockpitViews[view.section](viewParams)}
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
