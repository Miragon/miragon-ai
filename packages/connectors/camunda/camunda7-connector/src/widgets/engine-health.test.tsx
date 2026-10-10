// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost, type HostActionLog } from "@miragon/mcp-toolkit-ui/app"
import { EngineHealthVerdict } from "./engine-health.js"
import type { EngineHealthData } from "../view-models.js"
import { CAMUNDA7_WIDGET_ACTIONS_DATA } from "../tool-names.js"
import { widgetActionsFeedFor } from "./lib/hand-off.test-support.js"

afterEach(() => {
  cleanup()
  queryClient.clear()
})

/** The hand-offs follow the deployment's surface — these fixtures run as `operations`. */
let tools: Record<string, unknown>
beforeAll(async () => {
  tools = { [CAMUNDA7_WIDGET_ACTIONS_DATA]: await widgetActionsFeedFor("operations") }
})

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
  it("renders the verdict header, KPIs and the incident clusters with drill + ask handoffs", async () => {
    render(
      <WidgetFixtureHost
        widget={Widget}
        data={DEGRADED as unknown as Record<string, unknown>}
        tools={tools}
      />,
    )

    // Verdict header (title + deterministic headline) and the top-level AI handoff.
    expect(screen.getByText("Engine Overview")).toBeTruthy()
    expect(screen.getByText("Degraded — 51 open incidents across 3 activities")).toBeTruthy()
    expect(await screen.findByText("Analyze")).toBeTruthy()

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
    expect(await screen.findAllByText("Fix")).toHaveLength(2)
  })

  // A surface feed that cannot answer (failed call; a host without in-widget
  // tools/call) must not take every Ask-AI button with it: the hand-offs are
  // still offered, naming no tool they cannot confirm.
  it("keeps its hand-offs when the surface feed fails — naming no tool", async () => {
    // The shared client retries a failed query with backoff — fail at once.
    queryClient.setQueryDefaults(["camunda7-widget-actions"], { retry: false })
    const actions: HostActionLog[] = []
    render(
      <WidgetFixtureHost
        widget={Widget}
        data={DEGRADED as unknown as Record<string, unknown>}
        tools={{}}
        onHostAction={(action) => actions.push(action)}
      />,
    )
    fireEvent.click(await screen.findByRole("button", { name: /Analyze/ }))
    // Without a confirmed retry tool the clusters offer the diagnosis.
    expect(await screen.findAllByRole("button", { name: /Diagnose/ })).toHaveLength(2)
    const prompts = actions.flatMap((a) => (a.type === "sendFollowUpMessage" ? [a.prompt] : []))
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('Ids: engine="default"')
    expect(prompts[0]).not.toContain("Tools:")
    queryClient.setQueryDefaults(["camunda7-widget-actions"], {})
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
