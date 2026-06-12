// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { ClusterDetailWidget } from "./cluster-detail.js"
import type { ClusterDetailData } from "../view-models.js"

afterEach(cleanup)

const CLUSTER: ClusterDetailData = {
  activityId: "callWMS",
  incidentType: "failedExternalTask",
  messageSignature: "connection timeout to wms after <n>ms",
  incidentCount: 40,
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
  it("renders the cluster header, message, and business-key-first instance rows", () => {
    render(
      <WidgetFixtureHost widget={Widget} data={CLUSTER as unknown as Record<string, unknown>} />,
    )

    // Cluster identity + the guarded remediation handoff.
    expect(screen.getByText("callWMS")).toBeTruthy()
    expect(screen.getByText("failedExternalTask")).toBeTruthy()
    expect(screen.getByText("Fix")).toBeTruthy()

    // Full sample failure message.
    expect(screen.getByText("Connection timeout to WMS after 30000ms")).toBeTruthy()

    // Instance rows: business key first, UUID fallback when absent; the page
    // note shows the capped count.
    expect(screen.getByText("ORDER-4711")).toBeTruthy()
    expect(screen.getByText(/Instance a1b2c3d4/)).toBeTruthy()
    expect(screen.getByText(/showing 2 of 40/)).toBeTruthy()

    // Each row drills deterministically to instance + incident detail.
    expect(screen.getAllByText("Instance")).toHaveLength(2)
    expect(screen.getAllByText("Incident")).toHaveLength(2)
  })
})
