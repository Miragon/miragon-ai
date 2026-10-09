// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { complementaryFlags } from "@miragon-ai/camunda7-client"
import { CAMUNDA7_PROCESS_INSTANCES_DATA } from "../tool-names.js"
import type { ProcessInstancesData } from "../view-models.js"
import { ProcessInstancesView } from "./process-instances/list.js"

/**
 * #329: the feed maps a `false` run-state flag onto its complement
 * (`complementaryFlags`), so page 0 of `active: false` holds only suspended
 * instances. Every in-widget refetch — Load more, a chip, the search — must
 * reach the feed with the SAME run-state filter, or later pages mix in rows
 * page 0 excluded under page 0's total.
 */

afterEach(() => {
  cleanup()
  queryClient.clear()
})

type StateFlags = { active?: boolean; suspended?: boolean }

/** What the engine filters a feed call to — the feed's own mapping. */
const runState = (args: StateFlags) => complementaryFlags(args, "active", "suspended")

/** Page 0 as `buildProcessInstancesData` returns it for these show-tool args. */
function firstPage(flags: StateFlags): ProcessInstancesData {
  return {
    processDefinitionKey: "invoice",
    processDefinitionName: "Invoice",
    totalCount: 3,
    returnedCount: 2,
    withIncidentCount: 0,
    suspendedCount: 0,
    instances: ["pi-1", "pi-2"].map((id) => ({
      id,
      businessKey: `BK-${id}`,
      processDefinitionKey: "invoice",
      version: 1,
      suspended: flags.suspended === true || flags.active === false,
      hasIncident: false,
    })),
    filters: { ...flags, withIncidents: undefined, businessKeyLike: undefined },
    engineId: "prod",
  }
}

/** Renders `view` against a feed fixture that records every call's args. */
function renderWithFeed(view: ComponentType<Record<string, unknown>>) {
  const calls: Array<Record<string, unknown>> = []
  const feed = (args: Record<string, unknown>) => {
    calls.push(args)
    return { ...firstPage({}), instances: [], returnedCount: 0 }
  }
  render(
    <WidgetFixtureHost
      widget={view}
      data={{}}
      tools={{ [CAMUNDA7_PROCESS_INSTANCES_DATA]: feed }}
    />,
  )
  return calls
}

describe("process-instances widget keeps page 0's run-state filter", () => {
  it.each<StateFlags>([
    { active: false },
    { suspended: false },
    { active: true },
    { suspended: true },
  ])("Load more after a show call with %o", async (flags) => {
    const View = () => <ProcessInstancesView data={firstPage(flags)} />
    const calls = renderWithFeed(View)
    fireEvent.click(await screen.findByText("Load more"))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ processDefinitionKey: "invoice", engine: "prod" })
    expect(calls[0].firstResult).toBe(2)
    expect(runState(calls[0])).toEqual(runState(flags))
  })

  it("a composed view's false prop filters its own fetch", async () => {
    const View = () => (
      <ProcessInstancesView processDefinitionKey="invoice" engine="prod" suspended={false} />
    )
    const calls = renderWithFeed(View)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(runState(calls[0])).toEqual({ active: true })
  })

  it("the Suspended chip replaces the run-state filter instead of contradicting it", async () => {
    const View = () => <ProcessInstancesView data={firstPage({ active: true })} />
    const calls = renderWithFeed(View)
    fireEvent.click(await screen.findByText("Suspended"))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(runState(calls[0])).toEqual({ suspended: true })
  })
})
