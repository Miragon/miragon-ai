// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { IncidentOverviewKpi } from "./incidents-dashboard/overview-kpi.js"
import { IncidentProcessList } from "./incidents-dashboard/process-list.js"
import type { IncidentsDashboardData } from "../view-models.js"

afterEach(cleanup)

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
