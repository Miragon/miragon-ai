// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost, type HostActionLog } from "@miragon/mcp-toolkit-ui/app"
import { HostWidgetsProvider } from "@miragon-ai/widget-shell/widgets"
import { useNav } from "./navigation.js"
import { Camunda7StandaloneShell, findStepEngineId } from "./standalone-shell.js"

afterEach(() => {
  cleanup()
  // The toolkit query client is a singleton — clear it so one test's engines
  // result cannot leak into the next test's resolution path.
  queryClient.clear()
})

/** Minimal stand-in for a standalone widget that drills via `useNav()`. */
function DrillProbe() {
  const go = useNav()
  return (
    <div>
      <div>origin-content</div>
      <button type="button" onClick={() => go({ type: "settings" })}>
        drill-settings
      </button>
      <button
        type="button"
        onClick={() => go({ type: "process-instances", processDefinitionKey: "invoice" })}
      >
        drill-instances
      </button>
    </div>
  )
}

const Harness: ComponentType<Record<string, unknown>> = () => (
  <Camunda7StandaloneShell>
    <DrillProbe />
  </Camunda7StandaloneShell>
)

/** Stand-in for a FOREIGN module's section widget, as the host bundle registers it. */
const ForeignSection = () => <div>analytics-section</div>

/** The shell as the host root mounts it: inside the full-registry provider. */
const HarnessWithHostWidgets: ComponentType<Record<string, unknown>> = () => (
  <HostWidgetsProvider widgets={{ "analytics:settings": ForeignSection }}>
    <Camunda7StandaloneShell>
      <DrillProbe />
    </Camunda7StandaloneShell>
  </HostWidgetsProvider>
)

/** Feed fixtures for the drilled views' self-fetching widgets. */
const PROFILE_FEED = {
  profile: {
    id: "sess-1",
    language: "en",
    theme: "system",
    pinnedDashboardIds: [],
    analyticsDefaultPeriod: "7d",
    analyticsMinBucketSize: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    schemaVersion: 1,
  },
  availableEngines: [{ id: "prod-a", baseUrl: "http://localhost:1" }],
  canSave: true,
}

const INSTANCES_FEED = {
  processDefinitionKey: "invoice",
  processDefinitionName: null,
  totalCount: 0,
  returnedCount: 0,
  withIncidentCount: 0,
  suspendedCount: 0,
  instances: [],
  filters: {},
  engineId: "prod-a",
}

function renderShell(
  tools: Record<string, unknown>,
  actions: HostActionLog[],
  widget: ComponentType<Record<string, unknown>> = Harness,
) {
  return render(
    <WidgetFixtureHost
      widget={widget}
      data={{}}
      tools={tools}
      onHostAction={(action) => actions.push(action)}
    />,
  )
}

const followUps = (actions: HostActionLog[]) =>
  actions.filter((a) => a.type === "sendFollowUpMessage")

const originHidden = () => screen.getByText("origin-content").closest("[hidden]") !== null

describe("Camunda7StandaloneShell", () => {
  it("renders the origin untouched at depth 0 — no trail, no chrome", () => {
    const actions: HostActionLog[] = []
    renderShell({}, actions)
    expect(originHidden()).toBe(false)
    expect(screen.queryByRole("navigation")).toBeNull()
    expect(followUps(actions)).toHaveLength(0)
  })

  it("drills client-side without a chat follow-up and keeps the origin mounted", async () => {
    const actions: HostActionLog[] = []
    renderShell({ camunda7_user_profile_data: PROFILE_FEED }, actions)

    fireEvent.click(screen.getByText("drill-settings"))

    const trail = await screen.findByRole("navigation", { name: "Breadcrumb" })
    // Root crumb = the origin (fixture output carries no title → fallback),
    // current crumb = the drilled view.
    expect(trail.textContent).toContain("Start")
    expect(trail.textContent).toContain("Settings")
    expect(originHidden()).toBe(true)
    expect(followUps(actions)).toHaveLength(0)
  })

  it("resolves a composed view's FOREIGN section widget from the host registry", async () => {
    const actions: HostActionLog[] = []
    renderShell({ camunda7_user_profile_data: PROFILE_FEED }, actions, HarnessWithHostWidgets)

    fireEvent.click(screen.getByText("drill-settings"))

    await screen.findByRole("navigation", { name: "Breadcrumb" })
    // The settings view composes camunda7's own panel + the analytics module's
    // section by raw id — the latter only resolves through the host registry.
    expect(await screen.findByText("analytics-section")).toBeTruthy()
  })

  it("degrades to own widgets when the host provides no registry", async () => {
    const actions: HostActionLog[] = []
    renderShell({ camunda7_user_profile_data: PROFILE_FEED }, actions)

    fireEvent.click(screen.getByText("drill-settings"))

    await screen.findByRole("navigation", { name: "Breadcrumb" })
    expect(screen.queryByText("analytics-section")).toBeNull()
  })

  it("pops back to the origin via the root crumb", async () => {
    const actions: HostActionLog[] = []
    renderShell({ camunda7_user_profile_data: PROFILE_FEED }, actions)

    fireEvent.click(screen.getByText("drill-settings"))
    await screen.findByRole("navigation", { name: "Breadcrumb" })

    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    expect(originHidden()).toBe(false)
    expect(screen.queryByRole("navigation")).toBeNull()
  })

  it("resolves the engine via the engines feed when the tool result carries no echo", async () => {
    const actions: HostActionLog[] = []
    renderShell(
      {
        camunda7_engine: { engines: [{ id: "prod-a" }], currentSelection: "prod-a" },
        camunda7_process_instances_data: INSTANCES_FEED,
      },
      actions,
    )

    fireEvent.click(screen.getByText("drill-instances"))

    const trail = await screen.findByRole("navigation", { name: "Breadcrumb" })
    expect(trail.textContent).toContain("Instances")
    expect(followUps(actions)).toHaveLength(0)
  })

  it("keeps the way back available while the engines query never settles", async () => {
    const actions: HostActionLog[] = []
    renderShell(
      {
        // A hanging in-widget call (approval gate, broken transport): the shell
        // must never trap the user on the loading state.
        camunda7_engine: () => new Promise(() => {}),
      },
      actions,
    )

    fireEvent.click(screen.getByText("drill-instances"))

    const trail = await screen.findByRole("navigation", { name: "Breadcrumb" })
    expect(trail.textContent).toContain("Start")
    expect(screen.getByText("Loading engines…")).toBeTruthy()
    expect(followUps(actions)).toHaveLength(0)

    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    expect(originHidden()).toBe(false)
  })

  it("falls back to the conversational transport when no engine is resolvable", async () => {
    const actions: HostActionLog[] = []
    renderShell(
      {
        // Multi-engine, nothing sticky-selected: the shell cannot pick one.
        camunda7_engine: { engines: [{ id: "a" }, { id: "b" }], currentSelection: null },
      },
      actions,
    )

    fireEvent.click(screen.getByText("drill-instances"))

    await waitFor(() => expect(followUps(actions)).toHaveLength(1))
    const prompt = (followUps(actions)[0] as { prompt: string }).prompt
    expect(prompt).toContain("camunda7_show_process_instances")
    // The trail resets — the origin is visible again, exactly like before.
    expect(originHidden()).toBe(false)
    expect(screen.queryByRole("navigation")).toBeNull()
  })
})

describe("findStepEngineId", () => {
  it("finds the engine echo in a production-shaped structuredContent", () => {
    expect(
      findStepEngineId({
        layout: [],
        context: {
          stepData: {
            result: { _dataType: "camunda7:processList", data: { engineId: "prod-a" } },
          },
        },
      }),
    ).toBe("prod-a")
  })

  it("returns undefined for results without an echo", () => {
    expect(findStepEngineId(null)).toBeUndefined()
    expect(findStepEngineId({ context: { stepData: { s: { data: {} } } } })).toBeUndefined()
    expect(findStepEngineId({ context: {} })).toBeUndefined()
  })
})
