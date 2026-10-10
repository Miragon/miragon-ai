// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { ClusterDetailWidget, describeCluster } from "./cluster-detail.js"
import type { ClusterDetailData } from "../view-models.js"
import { CAMUNDA7_WIDGET_ACTIONS_DATA } from "../tool-names.js"
import { handOffFor, widgetActionsFeedFor } from "./lib/hand-off.test-support.js"

afterEach(() => {
  cleanup()
  queryClient.clear()
})

/** The hand-offs follow the deployment's surface — this fixture runs as `operations`. */
let tools: Record<string, unknown>
beforeAll(async () => {
  tools = { [CAMUNDA7_WIDGET_ACTIONS_DATA]: await widgetActionsFeedFor("operations") }
})

const CLUSTER: ClusterDetailData = {
  activityId: "callWMS",
  incidentType: "failedExternalTask",
  messageSignature: "connection timeout to wms after <n>ms",
  incidentCount: 40,
  scannedIncidentCount: 40,
  lastHourCount: 9,
  last24hCount: 12,
  firstSeen: "2026-06-11T08:00:00.000Z",
  latestIncident: "2026-06-11T14:00:00.000Z",
  processDefinitionKeys: ["shipping"],
  representativeMessage: "Connection timeout to WMS after 30000ms",
  incidents: [
    {
      incidentId: "inc-1",
      processInstanceId: "pi-1",
      businessKey: "ORDER-4711",
      processDefinitionKey: "shipping",
      incidentTimestamp: "2026-06-11T14:00:00.000Z",
    },
    {
      incidentId: "inc-2",
      processInstanceId: "a1b2c3d4-0000-0000-0000-000000000000",
      businessKey: null,
      processDefinitionKey: "shipping",
      incidentTimestamp: "2026-06-11T13:00:00.000Z",
    },
  ],
  totalMatching: 40,
  fetchedAt: "2026-06-11T14:05:00.000Z",
  engineId: "default",
}

const Widget = ClusterDetailWidget as unknown as ComponentType<Record<string, unknown>>

describe("ClusterDetailWidget (fixture render)", () => {
  it("renders the cluster header, message, and business-key-first instance rows", async () => {
    render(
      <WidgetFixtureHost
        widget={Widget}
        data={CLUSTER as unknown as Record<string, unknown>}
        tools={tools}
      />,
    )

    // Cluster identity + the guarded remediation handoff.
    expect(screen.getByText("callWMS")).toBeTruthy()
    expect(screen.getByText("failedExternalTask")).toBeTruthy()
    expect(await screen.findByText("Fix")).toBeTruthy()

    // Full sample failure message.
    expect(screen.getByText("Connection timeout to WMS after 30000ms")).toBeTruthy()

    // Instance rows: business key first, UUID fallback when absent; the list
    // footer shows the honest total plus an explicit Load-more control.
    expect(screen.getByText("ORDER-4711")).toBeTruthy()
    expect(screen.getByText(/Instance a1b2c3d4/)).toBeTruthy()
    expect(screen.getByText(/Showing 2 of 40 instances/)).toBeTruthy()
    expect(screen.getByText("Load more")).toBeTruthy()

    // Each row drills deterministically to instance + incident detail.
    expect(screen.getAllByText("Instance")).toHaveLength(2)
    expect(screen.getAllByText("Incident")).toHaveLength(2)
    // The scan holds the whole cluster: no capped-list note.
    expect(screen.queryByText(/The list covers the newest/)).toBeNull()
  })

  it("renders a cluster larger than the scan as a lower bound, its unknowns as —", () => {
    const capped: ClusterDetailData = {
      ...CLUSTER,
      incidentCount: null,
      scannedIncidentCount: 1000,
      lastHourCount: null,
      last24hCount: null,
      firstSeen: null,
      totalMatching: 1000,
    }
    render(
      <WidgetFixtureHost widget={Widget} data={capped as unknown as Record<string, unknown>} />,
    )

    // Never the scanned 1,000 passed off as the cluster's size (counts render
    // in the runtime's locale).
    const scanned = (1000).toLocaleString()
    expect(screen.getByText(`≥${scanned}`)).toBeTruthy()
    expect(screen.getByText(`≥${scanned} affected · across shipping`)).toBeTruthy()
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByText("0")).toBeNull()
    expect(
      screen.getByText(`The list covers the newest ${scanned} incidents of this cluster.`),
    ).toBeTruthy()
  })
})

// #335 facts in #338's model context: a capped scan's count is a lower bound,
// counts it cannot vouch for are left out (never 0), the list's coverage said.
describe("describeCluster", () => {
  it("states an exact cluster as exact, with its whole list", async () => {
    const text = (await handOffFor("operations")).context(describeCluster(CLUSTER))
    expect(text).toContain('processDefinitionKey="shipping"')
    expect(text).toContain("On screen: incidentCount=40, lastHour=9, last24h=12")
    expect(text).not.toMatch(/AtLeast|listCoversNewest|scannedProcessDefinitionKeys/)
  })

  it("states a capped cluster as at least its scanned share", async () => {
    const text = (await handOffFor("operations")).context(
      describeCluster({
        ...CLUSTER,
        incidentCount: null,
        scannedIncidentCount: 1000,
        lastHourCount: null,
        last24hCount: null,
        firstSeen: null,
      }),
    )
    // The keys are the scanned share's: a fact, never the scope (the rest of
    // the cluster may run on other processes).
    expect(text).toContain(
      'On screen: incidentCountAtLeast=1000, scannedProcessDefinitionKeys=["shipping"], latestIncident=',
    )
    expect(text).toContain("listCoversNewest=1000")
    expect(text).not.toMatch(/incidentCount=|lastHour|last24h|firstSeen|processDefinitionKey(In)?=/)
  })
})
