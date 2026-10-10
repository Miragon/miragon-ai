// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost, type HostActionLog } from "@miragon/mcp-toolkit-ui/app"
import { IncidentOverviewKpi } from "./incidents-dashboard/overview-kpi.js"
import { IncidentProcessList } from "./incidents-dashboard/process-list.js"
import { incidentsFeed } from "./incidents-dashboard/scope.js"
import type { IncidentsDashboardData } from "../view-models.js"
import { CAMUNDA7_INCIDENTS_DATA, CAMUNDA7_WIDGET_ACTIONS_DATA } from "../tool-names.js"
import { widgetActionsFeedFor } from "./lib/hand-off.test-support.js"

afterEach(() => {
  cleanup()
  queryClient.clear()
})

/**
 * The incidents overview renders what the server can vouch for (#335 N61):
 * exact key-wide card counts, the scanned breakdown disclosed as partial, and
 * every unknown (null) number as "—" — never a 0 that reads as a fact.
 */
const DATA: IncidentsDashboardData = {
  totalCount: 257,
  processCount: 2,
  affectedActivityCount: null,
  last24hCount: 251,
  latestIncident: "2026-10-10T12:00:00.000+0000",
  filters: {},
  engineId: "prod-a",
  processes: [
    {
      processDefinitionKey: "burst",
      processDefinitionName: "Burst",
      latestVersion: 2,
      runningInstances: 30,
      incidentCount: 250,
      scannedIncidentCount: 200,
      affectedActivityCount: null,
      last24hCount: null,
      latestIncident: "2026-10-10T12:00:00.000+0000",
      cockpitUrl: null,
      activities: [
        {
          activityId: "charge",
          activityName: null,
          representativeMessage: "card declined",
          scannedIncidentCount: 200,
          last24hCount: null,
          firstSeen: null,
          latestIncident: "2026-10-10T12:00:00.000+0000",
        },
      ],
    },
    {
      processDefinitionKey: "quiet",
      processDefinitionName: "Quiet",
      latestVersion: 1,
      runningInstances: 5,
      incidentCount: 7,
      scannedIncidentCount: 0,
      affectedActivityCount: null,
      last24hCount: 0,
      latestIncident: null,
      cockpitUrl: null,
      activities: [],
    },
  ],
}

const asWidget = (c: unknown) => c as ComponentType<Record<string, unknown>>
const data = DATA as unknown as Record<string, unknown>

describe("incidents dashboard widgets — honest numbers", () => {
  it("shows the unknown affected-activity total as —, never 0", () => {
    render(<WidgetFixtureHost widget={asWidget(IncidentOverviewKpi)} data={data} />)

    // label span → label row → the cell (label row + value row)
    const cell = screen.getByText("Activities affected").parentElement!.parentElement!
    expect(within(cell).getByText("—")).toBeTruthy()
    expect(within(cell).queryByText("0")).toBeNull()
  })

  it("keeps a process beyond the scan with its exact count and discloses a partial breakdown", () => {
    render(<WidgetFixtureHost widget={asWidget(IncidentProcessList)} data={data} />)

    expect(screen.getByText("250")).toBeTruthy()
    // quiet's incidents all lie beyond the scan — still listed, with its exact 7.
    expect(screen.getByText("Quiet")).toBeTruthy()
    expect(screen.getByText("7")).toBeTruthy()

    fireEvent.click(screen.getByText("Burst"))
    expect(
      screen.getByText(
        "Breakdown of the newest 200 of 250 incidents — open the process for exact per-activity counts.",
      ),
    ).toBeTruthy()
  })

  it("the Last 24h chip shows the key's 24h count (— when unknown) and drops a process without any", () => {
    render(<WidgetFixtureHost widget={asWidget(IncidentProcessList)} data={data} />)

    fireEvent.click(screen.getByText("⏱ Last 24h"))

    expect(screen.getByText("Burst")).toBeTruthy()
    expect(screen.queryByText("Quiet")).toBeNull()
    expect(screen.queryByText("250")).toBeNull()
  })
})

/**
 * A filtered dashboard (`camunda7_show_incidents_dashboard` with a key and an
 * incident type) counts only the filtered set: its hand-offs pass the filters
 * as ids and state the count as the set's, and a refetch keeps them — read
 * from the data's own echo, since a standalone render gets no props.
 */
describe("incidents dashboard — a filtered view keeps its scope", () => {
  const FILTERED: IncidentsDashboardData = {
    ...DATA,
    totalCount: 7,
    processCount: 1,
    last24hCount: 0,
    latestIncident: null,
    processes: [DATA.processes[1]],
    filters: { processDefinitionKey: "quiet", incidentType: "failedJob" },
  }

  let tools: Record<string, unknown>
  beforeAll(async () => {
    tools = { [CAMUNDA7_WIDGET_ACTIONS_DATA]: await widgetActionsFeedFor("read-only") }
  })

  /** Renders `widget` and returns the hand-off its Analyze button posts. */
  async function promptOf(
    widget: unknown,
    props: { data?: IncidentsDashboardData; tools?: Record<string, unknown> },
  ) {
    const actions: HostActionLog[] = []
    render(
      <WidgetFixtureHost
        widget={asWidget(widget)}
        data={(props.data ?? {}) as unknown as Record<string, unknown>}
        tools={{ ...tools, ...props.tools }}
        onHostAction={(action) => actions.push(action)}
      />,
    )
    // A card's toggle wraps its Analyze button — click the button itself.
    const [analyze] = (await screen.findAllByRole("button", { name: /Analyze/ })).sort(
      (a, b) => (a.textContent ?? "").length - (b.textContent ?? "").length,
    )
    fireEvent.click(analyze)
    const prompts = actions.flatMap((a) => (a.type === "sendFollowUpMessage" ? [a.prompt] : []))
    expect(prompts).toHaveLength(1)
    return prompts[0]
  }

  it("the triage passes the filters as ids and states the filtered count", async () => {
    const prompt = await promptOf(IncidentOverviewKpi, { data: FILTERED })

    expect(prompt).toContain(
      'Ids: engine="prod-a", processDefinitionKey="quiet", incidentType="failedJob"\n',
    )
    expect(prompt).toContain("On screen: matchingIncidents=7, processes=1")
    expect(prompt).not.toContain("openIncidents")
    expect(prompt).not.toMatch(/all open incidents on this engine/)
  })

  it("an unfiltered triage states the engine's open incidents and no filter", async () => {
    const prompt = await promptOf(IncidentOverviewKpi, { data: DATA })

    expect(prompt).toContain('Ids: engine="prod-a"\n')
    expect(prompt).toContain("On screen: openIncidents=257, processes=2")
    expect(prompt).not.toMatch(/matchingIncidents|incidentType=/)
  })

  it("a card's root-cause hand-off carries the incident-type filter of its count", async () => {
    const prompt = await promptOf(IncidentProcessList, { data: FILTERED })

    expect(prompt).toContain(
      'Ids: engine="prod-a", processDefinitionKey="quiet", incidentType="failedJob"\n',
    )
    expect(prompt).toContain('countScope="allVersions", latestVersion=1, matchingIncidents=7')
    expect(prompt).not.toContain("openIncidents")
  })

  it("the self-fetch carries the echoed filters, so a refetch keeps the scope", () => {
    const feed = incidentsFeed(FILTERED, undefined)
    expect(feed.args).toEqual({
      engine: "prod-a",
      processDefinitionKey: "quiet",
      incidentType: "failedJob",
    })
    // Its own cache entry: never the unfiltered dashboard's.
    expect(feed.key).not.toEqual(incidentsFeed(DATA, undefined).key)
    // A cockpit render (props only) fetches the engine's unfiltered dashboard.
    expect(incidentsFeed(null, "prod-b").args).toEqual({ engine: "prod-b" })
  })

  it("a self-fetched view hands off the scope its fetched data echoes", async () => {
    const calls: Array<Record<string, unknown>> = []
    const View = (props: Record<string, unknown>) => (
      <IncidentOverviewKpi {...props} data={null} engine="prod-a" />
    )
    const prompt = await promptOf(View, {
      tools: {
        [CAMUNDA7_INCIDENTS_DATA]: (args: Record<string, unknown>) => {
          calls.push(args)
          return FILTERED
        },
      },
    })

    await waitFor(() => expect(calls).toEqual([{ engine: "prod-a" }]))
    expect(prompt).toContain('incidentType="failedJob"')
    expect(prompt).toContain("matchingIncidents=7")
  })
})
