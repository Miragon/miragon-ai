import { useEffect, useState } from "react"
import { ModelContext, useWidget } from "mcp-use/react"
import { Alert, AlertDescription, useToolQuery } from "@miragon/mcp-toolkit-ui"
import { WidgetShell, useHostActions, type HostActions } from "@miragon-ai/widget-shell/widgets"
import type { CockpitAppData } from "@miragon-ai/client-cibseven"
import { navigateViaHost, type NavIntent, type OnNavigate } from "../navigation.js"
import {
  IncidentsLoader,
  InstanceDetailLoader,
  JobsLoader,
  OverviewView,
  ProcessDetailLoader,
  ProcessInstancesLoader,
} from "./view-loaders.js"

export type { CockpitAppData }

interface EnginesResult {
  engines: Array<{ id: string }>
  currentSelection: string | null
}

/** Internal, client-side view state — mirrors NavIntent but drives the router. */
type CockpitView =
  | { section: "overview" }
  | { section: "incidents" }
  | { section: "jobs" }
  | { section: "process-detail"; processDefinitionKey: string }
  | { section: "process-instances"; processDefinitionKey: string }
  | { section: "instance-detail"; processInstanceId: string }

type TopSection = "overview" | "incidents" | "jobs"

const SECTIONS: Array<{ id: TopSection; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "▦" },
  { id: "incidents", label: "Incidents", icon: "⚠" },
  { id: "jobs", label: "Jobs", icon: "⚙" },
]

function topSectionOf(view: CockpitView): TopSection {
  switch (view.section) {
    case "process-detail":
    case "process-instances":
    case "instance-detail":
      return "overview"
    default:
      return view.section
  }
}

interface Crumb {
  label: string
  view?: CockpitView
}

function breadcrumbOf(view: CockpitView): Crumb[] {
  switch (view.section) {
    case "process-detail":
      return [
        { label: "Overview", view: { section: "overview" } },
        { label: view.processDefinitionKey },
      ]
    case "process-instances":
      return [
        { label: "Overview", view: { section: "overview" } },
        {
          label: view.processDefinitionKey,
          view: { section: "process-detail", processDefinitionKey: view.processDefinitionKey },
        },
        { label: "Instances" },
      ]
    case "instance-detail":
      return [
        { label: "Overview", view: { section: "overview" } },
        { label: `Instance ${view.processInstanceId.slice(0, 8)}…` },
      ]
    default:
      return []
  }
}

export function CockpitApp({ data }: { data: CockpitAppData | null }) {
  const { requestDisplayMode, callTool } = useWidget()
  const host: HostActions = useHostActions()

  // Authoritative engine source: the stable `camunda7_list_engines` tool (needs
  // no selection itself). Decoupled from the open_cockpit bootstrap so the
  // picker/switcher work regardless of how the app was launched.
  const enginesQuery = useToolQuery<EnginesResult>(
    ["camunda7:engines"],
    "camunda7_list_engines",
    {},
  )
  const engines = enginesQuery.data?.engines ?? data?.engines ?? []

  const [picked, setPicked] = useState<string | null>(null)
  const [view, setView] = useState<CockpitView>({ section: "overview" })

  // App-like surface: ask the host for fullscreen once on mount.
  useEffect(() => {
    void requestDisplayMode("fullscreen").catch(() => {
      /* host may decline; inline still works */
    })
  }, [requestDisplayMode])

  // Resolution order: explicit user pick → sticky session selection →
  // open_cockpit hint → the only engine (if just one).
  const engineId =
    picked ??
    enginesQuery.data?.currentSelection ??
    data?.engineId ??
    (engines.length === 1 ? engines[0].id : null)

  // Deterministic, client-side navigation. Views the app hosts itself are
  // routed in-place (no LLM); the rest fall back to the conversational host
  // bridge (a follow-up turn) until they get their own in-app view.
  const navigate: OnNavigate = (intent: NavIntent) => {
    switch (intent.type) {
      case "process-list":
        setView({ section: "overview" })
        return
      case "incidents":
      case "jobs":
        setView({ section: intent.type })
        return
      case "process-detail":
        setView({ section: "process-detail", processDefinitionKey: intent.processDefinitionKey })
        return
      case "process-instances":
        setView({ section: "process-instances", processDefinitionKey: intent.processDefinitionKey })
        return
      case "instance-detail":
        setView({ section: "instance-detail", processInstanceId: intent.processInstanceId })
        return
      // Not hosted in-cockpit — delegate to the agent (opens the matching widget).
      case "tasks":
      case "deployments":
      case "process-incidents":
      case "incident-detail":
        navigateViaHost(host, intent)
        return
    }
  }

  // Pick (or switch) the active engine. The cockpit threads `engine` into its
  // own views explicitly, but we ALSO make the selection sticky for the session
  // so delegated/agentic paths (incidents, "ask AI" actions) use the same engine.
  function chooseEngine(id: string) {
    setPicked(id)
    setView({ section: "overview" })
    void callTool("camunda7_select_engine", { id }).catch(() => {
      /* override on each call still works even if sticky selection fails */
    })
  }

  // No engine resolved yet → load / let the user pick.
  if (!engineId) {
    if (enginesQuery.isError) {
      return (
        <WidgetShell>
          <Alert variant="destructive">
            <AlertDescription>{enginesQuery.error.message}</AlertDescription>
          </Alert>
        </WidgetShell>
      )
    }
    if (engines.length === 0 && enginesQuery.data === undefined) {
      return (
        <WidgetShell>
          <div className="text-muted-foreground p-6 text-sm">Loading engines…</div>
        </WidgetShell>
      )
    }
    return (
      <WidgetShell>
        <div className="mx-auto flex max-w-md flex-col gap-3 py-10 text-center">
          <h1 className="text-foreground text-xl font-bold">Select an engine</h1>
          <p className="text-muted-foreground text-sm">
            {engines.length === 0
              ? "No CIB Seven engines are configured."
              : "Choose which engine this cockpit should operate on."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {engines.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => chooseEngine(e.id)}
                className="border-border bg-card text-foreground hover:bg-muted focus-visible:ring-ring rounded-md border px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2"
              >
                {e.id}
              </button>
            ))}
          </div>
        </div>
      </WidgetShell>
    )
  }

  const activeSection = topSectionOf(view)
  const crumbs = breadcrumbOf(view)

  return (
    <WidgetShell>
      <ModelContext
        content={`Support is in the consolidated CIB Seven cockpit (camunda7_open_cockpit) on engine "${engineId}". Current view: ${view.section}. Navigation is client-side; drill definitions → instances → instance. Offer agentic help (analyze incident, prepare modification/migration, create ticket) when relevant.`}
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
                  {s.label}
                </button>
              )
            })}
          </nav>

          {engines.length > 1 && (
            <label className="text-muted-foreground flex flex-col gap-1 px-3 text-[11px] font-medium">
              Engine
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
                      onClick={() => setView(c.view)}
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

          {view.section === "overview" && (
            <OverviewView engineId={engineId} onNavigate={navigate} />
          )}
          {view.section === "incidents" && (
            <IncidentsLoader engineId={engineId} onNavigate={navigate} />
          )}
          {view.section === "jobs" && <JobsLoader engineId={engineId} />}
          {view.section === "process-detail" && (
            <ProcessDetailLoader
              processDefinitionKey={view.processDefinitionKey}
              engineId={engineId}
              onNavigate={navigate}
            />
          )}
          {view.section === "process-instances" && (
            <ProcessInstancesLoader
              processDefinitionKey={view.processDefinitionKey}
              engineId={engineId}
              onNavigate={navigate}
            />
          )}
          {view.section === "instance-detail" && (
            <InstanceDetailLoader processInstanceId={view.processInstanceId} engineId={engineId} />
          )}
        </main>
      </div>
    </WidgetShell>
  )
}
