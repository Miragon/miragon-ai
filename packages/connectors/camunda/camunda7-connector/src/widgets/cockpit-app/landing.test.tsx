// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { CAMUNDA7_COCKPIT_OVERVIEW_DATA } from "../../tool-names.js"
import { useAnalyticsActive } from "./analytics-probe.js"
import { LandingChooser } from "./landing.js"

// The toolkit query client is a singleton: its defaults are restored and its
// cache cleared after each test, so no feed answer leaks across tests.
const toolkitDefaults = queryClient.getDefaultOptions()

beforeEach(() => {
  // Deterministic error states: the default three retries would hold a failed
  // feed in "pending" for seconds.
  queryClient.setDefaultOptions({
    ...toolkitDefaults,
    queries: { ...toolkitDefaults.queries, retry: false },
  })
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  queryClient.setDefaultOptions(toolkitDefaults)
})

const ENGINES = [{ id: "prod-a" }, { id: "prod-b" }, { id: "prod-c" }]

/** Per-engine overview feed: prod-a has open incidents, prod-b is healthy, prod-c unreachable. */
function overviewFeed(args: Record<string, unknown>) {
  if (args.engine === "prod-c") throw new Error("ECONNREFUSED")
  const incidents = args.engine === "prod-a" ? 3 : 0
  return {
    summary: {
      totalDefinitions: 2,
      totalRunningInstances: 10,
      totalFailedJobs: 0,
      totalIncidents: incidents,
    },
    definitions: [],
    engineId: args.engine,
  }
}

function renderLanding(onOpenFleet?: () => void) {
  const Landing: ComponentType<Record<string, unknown>> = () => (
    <LandingChooser engines={ENGINES} onEnterEngine={() => {}} onOpenFleet={onOpenFleet} />
  )
  render(
    <WidgetFixtureHost
      widget={Landing}
      data={{}}
      tools={{ [CAMUNDA7_COCKPIT_OVERVIEW_DATA]: overviewFeed }}
    />,
  )
}

describe("LandingChooser", () => {
  it("offers the cross-engine view only when the cockpit passes it in", () => {
    renderLanding(() => {})
    expect(screen.getByText("Cross-engine analyses")).toBeTruthy()
    expect(screen.getByText(/or analyze across the whole fleet/)).toBeTruthy()
  })

  it("without analytics: no fleet card, and the subtitle promises no fleet analysis", () => {
    renderLanding(undefined)
    expect(screen.queryByText("Cross-engine analyses")).toBeNull()
    expect(screen.getByText("3 engines configured — pick one to operate.")).toBeTruthy()
  })

  it("shows each engine's live health on the picker buttons", async () => {
    renderLanding(undefined)
    const prodA = await screen.findByRole("button", { name: /prod-a.*3 incidents/ })
    expect(prodA).toBeTruthy()
    expect(await screen.findByRole("button", { name: /prod-c.*status unavailable/ })).toBeTruthy()
    // A healthy engine carries no incident text — only its dot.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /prod-b/ }).textContent).not.toMatch(/incident/),
    )
  })
})

describe("useAnalyticsActive", () => {
  function Probe() {
    return <span>{`analytics:${String(useAnalyticsActive())}`}</span>
  }
  const ProbeWidget = Probe as unknown as ComponentType<Record<string, unknown>>

  it("is true once the analytics settings feed answers", async () => {
    render(
      <WidgetFixtureHost
        widget={ProbeWidget}
        data={{}}
        tools={{ analytics_settings_data: { settings: {} } }}
      />,
    )
    expect(screen.getByText("analytics:false")).toBeTruthy()
    expect(await screen.findByText("analytics:true")).toBeTruthy()
  })

  it("stays false when the module is not active (unknown tool)", async () => {
    render(<WidgetFixtureHost widget={ProbeWidget} data={{}} tools={{}} />)
    await waitFor(() =>
      expect(
        queryClient.getQueryCache().find({ queryKey: ["analytics-probe"], exact: false })?.state
          .status,
      ).toBe("error"),
    )
    expect(screen.getByText("analytics:false")).toBeTruthy()
  })
})
