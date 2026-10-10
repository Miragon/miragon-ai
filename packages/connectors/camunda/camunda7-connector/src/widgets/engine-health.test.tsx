// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { EngineHealthVerdict } from "./engine-health.js"
import type { EngineHealthData } from "../view-models.js"

afterEach(cleanup)

const RULE =
  "From the engine's open incidents, read live: critical at >=50 open or >=25 in one cluster, degraded with any, else ok."

const DEGRADED: EngineHealthData = {
  status: "degraded",
  statusRule: RULE,
  headline: "Degraded — 51 open incidents across 3 activities",
  summary: {
    totalIncidents: 51,
    lastHourIncidents: 9,
    last24hIncidents: 12,
    affectedActivities: 3,
    affectedDefinitions: 2,
    runningInstances: 312,
    totalDefinitions: 8,
    started24h: 1240,
    completed24h: 1180,
  },
  clusters: [
    {
      id: "callWMS::failedExternalTask",
      activityId: "callWMS",
      incidentType: "failedExternalTask",
      messageSignature: "connection timeout to wms",
      incidentCount: 40,
      scannedIncidentCount: 40,
      last24hCount: 10,
      processDefinitionKeys: ["shipping"],
      representativeMessage: "Connection timeout to WMS",
      representativeIncidentId: "inc-1",
      latestIncident: "2026-06-11T14:00:00.000Z",
    },
    {
      id: "checkCustomer::failedJob",
      activityId: "checkCustomer",
      incidentType: "failedJob",
      messageSignature: "customerid is null",
      incidentCount: 8,
      scannedIncidentCount: 8,
      last24hCount: 2,
      processDefinitionKeys: ["onboarding", "shipping"],
      representativeMessage: "customerId is null",
      representativeIncidentId: "inc-2",
      latestIncident: "2026-06-11T13:00:00.000Z",
    },
  ],
  fetchedAt: "2026-06-11T14:05:00.000Z",
  engineId: "default",
}

const HEALTHY: EngineHealthData = {
  status: "ok",
  statusRule: RULE,
  headline: "Stable — no open incidents (312 running instances)",
  summary: {
    totalIncidents: 0,
    lastHourIncidents: 0,
    last24hIncidents: 0,
    affectedActivities: 0,
    affectedDefinitions: 0,
    runningInstances: 312,
    totalDefinitions: 8,
    started24h: 1240,
    completed24h: 1180,
  },
  clusters: [],
  fetchedAt: "2026-06-11T14:05:00.000Z",
  engineId: "default",
}

const Widget = EngineHealthVerdict as unknown as ComponentType<Record<string, unknown>>

describe("EngineHealthVerdict (fixture render)", () => {
  it("renders the verdict header, KPIs and the incident clusters with drill + ask handoffs", () => {
    render(
      <WidgetFixtureHost widget={Widget} data={DEGRADED as unknown as Record<string, unknown>} />,
    )

    // Verdict header (title + deterministic headline) and the top-level AI handoff.
    expect(screen.getByText("Engine Overview")).toBeTruthy()
    expect(screen.getByText("Degraded — 51 open incidents across 3 activities")).toBeTruthy()
    expect(screen.getByText("Analyze")).toBeTruthy()

    // KPI row.
    expect(screen.getByText("Running instances")).toBeTruthy()

    // Freshness affordances: the "as of" stamp + a manual refresh button.
    expect(screen.getByText(/as of/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "↻ Refresh" })).toBeTruthy()

    // Clustered incidents (cross-process, by activity + type).
    expect(screen.getByText("Top failures (grouped by root cause)")).toBeTruthy()
    expect(screen.getByText("callWMS")).toBeTruthy()
    expect(screen.getByText("failedExternalTask")).toBeTruthy()
    expect(screen.getByText("checkCustomer")).toBeTruthy()

    // Each cluster carries both launchpads: a deterministic drill + the guarded
    // remediation handoff to the agent.
    expect(screen.getAllByText("Open")).toHaveLength(2)
    expect(screen.getAllByText("Fix")).toHaveLength(2)
  })

  it("renders the stable verdict with no cluster list when there are no incidents", () => {
    render(
      <WidgetFixtureHost widget={Widget} data={HEALTHY as unknown as Record<string, unknown>} />,
    )

    expect(screen.getByText("Stable — no open incidents (312 running instances)")).toBeTruthy()
    expect(screen.queryByText("Top failures (grouped by root cause)")).toBeNull()

    // The healthy state still earns the screen: throughput is visible.
    expect(screen.getByText(/Throughput \(24h\)/)).toBeTruthy()
    expect(screen.getByText(/started/)).toBeTruthy()
  })

  it("shows a capped scan's cluster as the lower bound it is, never as its size", () => {
    const capped: EngineHealthData = {
      ...DEGRADED,
      clusters: [
        {
          ...DEGRADED.clusters[0],
          incidentCount: null,
          scannedIncidentCount: 1400,
          last24hCount: null,
        },
      ],
    }
    render(
      <WidgetFixtureHost widget={Widget} data={capped as unknown as Record<string, unknown>} />,
    )

    expect(screen.getByText(`≥${(1400).toLocaleString()} affected`, { exact: false })).toBeTruthy()
    // An unknown 24h count is left out, not rendered as "0 new in 24h".
    expect(screen.queryByText(/new in 24h/)).toBeNull()
  })
})
