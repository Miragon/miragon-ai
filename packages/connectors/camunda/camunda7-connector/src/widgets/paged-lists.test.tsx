// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import {
  CAMUNDA7_CLUSTER_DETAIL_DATA,
  CAMUNDA7_PROCESS_INSTANCES_DATA,
  CAMUNDA7_PROCESS_LIST_DATA,
} from "../tool-names.js"
import type {
  ClusterDetailData,
  ProcessDefinition,
  ProcessInstancesData,
  ProcessListData,
} from "../view-models.js"
import { ClusterDetailWidget } from "./cluster-detail.js"
import { ProcessInstancesWidget } from "./process-instances/list.js"
import { ProcessListWidget } from "./process-list.js"

/**
 * The three searchable paged lists against the REAL toolkit query stack
 * (`useToolQuery` → TanStack, no mock), so a pending page 0 is pending here
 * exactly as in a host (#341):
 *
 * - N123: a search or chip keys a new page 0 that is undefined until it
 *   lands — the list, and the search box the operator is typing into, must
 *   stay mounted with the previous rows meanwhile;
 * - N130: a page-0 failure over rows on screen is its own error with a retry
 *   that re-runs page 0 — never "Failed to load more".
 */

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

/** A feed fixture whose answers the test releases by hand. */
function deferredFeed<T>() {
  const calls: Array<{ args: Record<string, unknown>; resolve: (value: T) => void }> = []
  const handler = (args: Record<string, unknown>) =>
    new Promise<T>((resolve) => {
      calls.push({ args, resolve })
    })
  return { calls, handler }
}

function definition(key: string, name: string): ProcessDefinition {
  return {
    id: `${key}:1:d`,
    key,
    name,
    version: 1,
    deploymentId: "dep",
    suspended: false,
    versionTag: null,
    tenantId: null,
  }
}

const DEFINITIONS: ProcessListData = {
  definitions: [definition("invoice", "Invoice Process"), definition("order", "Order Process")],
  totalCount: 2,
  filters: { latestVersion: true },
  engineId: "prod-a",
}

function instances(ids: string[], total: number): ProcessInstancesData {
  return {
    processDefinitionKey: "invoice",
    processDefinitionName: "Invoice",
    totalCount: total,
    returnedCount: ids.length,
    withIncidentCount: 0,
    suspendedCount: 0,
    instances: ids.map((id) => ({
      id,
      businessKey: `BK-${id}`,
      processDefinitionKey: "invoice",
      version: 1,
      suspended: false,
      hasIncident: false,
    })),
    filters: {},
    engineId: "prod-a",
  }
}

const CLUSTER: ClusterDetailData = {
  activityId: "callWMS",
  incidentType: "failedExternalTask",
  messageSignature: "connection timeout",
  incidentCount: 2,
  scannedIncidentCount: 2,
  lastHourCount: 1,
  last24hCount: 2,
  firstSeen: "2026-06-11T08:00:00.000Z",
  latestIncident: "2026-06-11T14:00:00.000Z",
  processDefinitionKeys: ["shipping"],
  representativeMessage: "Connection timeout",
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
      processInstanceId: "pi-2",
      businessKey: "ORDER-4712",
      processDefinitionKey: "shipping",
      incidentTimestamp: "2026-06-11T13:00:00.000Z",
    },
  ],
  totalMatching: 2,
  fetchedAt: "2026-06-11T14:05:00.000Z",
  engineId: "prod-a",
}

function host(widget: ComponentType<Record<string, unknown>>, tools: Record<string, unknown>) {
  render(<WidgetFixtureHost widget={widget} data={{}} tools={tools} />)
}

describe("a search keeps the list and its search box mounted while page 0 is in flight (N123)", () => {
  it("process list", async () => {
    const feed = deferredFeed<ProcessListData>()
    const Widget = () => <ProcessListWidget data={DEFINITIONS} />
    host(Widget, { [CAMUNDA7_PROCESS_LIST_DATA]: feed.handler })

    const search = screen.getByPlaceholderText("Filter by name…")
    search.focus()
    fireEvent.change(search, { target: { value: "inv" } })
    // The debounced, server-side search reaches the feed …
    await waitFor(() => expect(feed.calls).toHaveLength(1), { timeout: 2_000 })
    expect(feed.calls[0].args).toMatchObject({ nameLike: "inv" })

    // … and while it is pending the operator keeps typing into the SAME box,
    // above the previous rows.
    expect(search.isConnected).toBe(true)
    expect(document.activeElement).toBe(search)
    expect(screen.getByText("Order Process")).toBeTruthy()

    feed.calls[0].resolve({ ...DEFINITIONS, definitions: [DEFINITIONS.definitions[0]] })
    await waitFor(() => expect(screen.queryByText("Order Process")).toBeNull())
    expect(screen.getByText("Invoice Process")).toBeTruthy()
    expect(screen.getByPlaceholderText("Filter by name…")).toBe(search)
  })

  it("process instances (search and chip)", async () => {
    const feed = deferredFeed<ProcessInstancesData>()
    const Widget = () => <ProcessInstancesWidget data={instances(["pi-1", "pi-2"], 2)} />
    host(Widget, { [CAMUNDA7_PROCESS_INSTANCES_DATA]: feed.handler })

    const search = screen.getByPlaceholderText("Search by business key…")
    fireEvent.click(screen.getByRole("button", { name: "With incidents" }))
    await waitFor(() => expect(feed.calls).toHaveLength(1))
    expect(feed.calls[0].args).toMatchObject({ withIncidents: true })
    expect(search.isConnected).toBe(true)
    expect(screen.getByText("BK-pi-2")).toBeTruthy()

    feed.calls[0].resolve(instances(["pi-2"], 1))
    await waitFor(() => expect(screen.queryByText("BK-pi-1")).toBeNull())

    fireEvent.change(search, { target: { value: "BK-9" } })
    await waitFor(() => expect(feed.calls).toHaveLength(2), { timeout: 2_000 })
    expect(feed.calls[1].args).toMatchObject({ businessKeyLike: "BK-9", withIncidents: true })
    expect(search.isConnected).toBe(true)
    expect(screen.getByText("BK-pi-2")).toBeTruthy()
  })

  it("cluster detail", async () => {
    const feed = deferredFeed<ClusterDetailData>()
    const Widget = () => <ClusterDetailWidget data={CLUSTER} />
    host(Widget, { [CAMUNDA7_CLUSTER_DETAIL_DATA]: feed.handler })

    const search = screen.getByPlaceholderText("Filter by business key…")
    fireEvent.change(search, { target: { value: "4711" } })
    await waitFor(() => expect(feed.calls).toHaveLength(1), { timeout: 2_000 })
    expect(feed.calls[0].args).toMatchObject({ businessKeyLike: "4711" })
    expect(search.isConnected).toBe(true)
    expect(screen.getByText("ORDER-4712")).toBeTruthy()

    feed.calls[0].resolve({ ...CLUSTER, incidents: [CLUSTER.incidents[0]], totalMatching: 1 })
    await waitFor(() => expect(screen.queryByText("ORDER-4712")).toBeNull())
    expect(screen.getByText("ORDER-4711")).toBeTruthy()
  })
})

describe("a page-0 failure over rows on screen is not a load-more failure (N130)", () => {
  /**
   * The cockpit's self-fetching process list: page 0 lists two of five
   * definitions, so Load more is offered. `failPage0` / `failMore` break
   * the respective call.
   */
  function selfFetchingList() {
    const state = { failPage0: false, failMore: false }
    const calls: Array<Record<string, unknown>> = []
    const feed = (args: Record<string, unknown>) => {
      calls.push(args)
      const more = (args.firstResult as number) > 0
      if (more ? state.failMore : state.failPage0) {
        throw new Error(more ? "page 2 timed out" : "engine down")
      }
      return more
        ? { ...DEFINITIONS, definitions: [definition("pay", "Payment Process")], totalCount: 5 }
        : { ...DEFINITIONS, totalCount: 5 }
    }
    const Widget = () => <ProcessListWidget data={null} engine="prod-a" />
    host(Widget, { [CAMUNDA7_PROCESS_LIST_DATA]: feed })
    return { state, calls }
  }

  it("a failed refetch keeps the rows, says so, and its retry re-runs page 0", async () => {
    const { state, calls } = selfFetchingList()
    await screen.findByText("Invoice Process")

    // A write elsewhere invalidated the cockpit's lists; the refetch fails.
    state.failPage0 = true
    await queryClient.invalidateQueries({ queryKey: ["camunda7:process-list"] })

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Could not update the list")
    expect(alert.textContent).toContain("engine down")
    expect(alert.textContent).not.toContain("Failed to load more")
    expect(screen.getByText("Invoice Process")).toBeTruthy()

    state.failPage0 = false
    const before = calls.length
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
    // The retry re-ran page 0 — not the next offset.
    expect(calls.slice(before)).toEqual([expect.objectContaining({ firstResult: 0 })])
  })

  it("a failed Load more says so, and its retry fetches the next offset", async () => {
    const { state, calls } = selfFetchingList()
    await screen.findByText("Invoice Process")

    state.failMore = true
    fireEvent.click(screen.getByRole("button", { name: "Load more" }))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Failed to load more: page 2 timed out")
    expect(alert.textContent).not.toContain("Could not update the list")

    state.failMore = false
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }))
    await screen.findByText("Payment Process")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(calls.at(-1)).toMatchObject({ firstResult: 2 })
  })
})
