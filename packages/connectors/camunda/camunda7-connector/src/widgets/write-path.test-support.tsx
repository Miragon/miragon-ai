import { afterEach, beforeAll, beforeEach, expect } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { CAMUNDA7_INSTANCE_DETAIL_DATA, CAMUNDA7_WIDGET_ACTIONS_DATA } from "../tool-names.js"
import type { IncidentInstance, InstanceDetailData, OpenUserTask } from "../view-models.js"
import { InstanceDetailWidget } from "./instance-detail.js"
import { widgetActionsFeedFor } from "./lib/hand-off.test-support.js"

/**
 * The shared harness of the #341 write-path suites (`write-path`,
 * `write-state`, `write-refresh`): the toolkit's singleton query client reset
 * per test, an admin deployment's gate, the instance fixture, and the
 * interactions the suites repeat.
 */

const toolkitDefaults = queryClient.getDefaultOptions()

/** What an admin deployment's feed answers — every in-widget write is offered. */
let admin: { allowedActions: string[]; modelTools: string[] }

/** The admin deployment's widget-actions answer (loaded by the harness). */
export const adminActions = () => admin

/** Registers the per-suite hooks — call once at the top of a write-path suite. */
export function installWritePathHarness(): void {
  beforeAll(async () => {
    admin = await widgetActionsFeedFor("admin")
  })
  beforeEach(() => {
    // The shared client retries a failed query with backoff — answer at once.
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
}

/**
 * What a real host runs: the toolkit's own query defaults — TanStack retries
 * a failed query 3× with 1 s/2 s/4 s backoff, and `error` stays null all that
 * time (only the attempt's `failureReason` is set).
 */
export function withProductionRetries() {
  queryClient.setDefaultOptions(toolkitDefaults)
}

export function task(id: string, name: string): OpenUserTask {
  return {
    id,
    name,
    assignee: null,
    created: "2026-10-10T08:00:00.000+0000",
    due: null,
    priority: 50,
    processDefinitionId: "invoice:1:abc",
    processInstanceId: "pi-1",
    taskDefinitionKey: id,
    description: null,
    formSchema: { taskId: id, fields: [] },
  }
}

export function instance(over: Partial<InstanceDetailData> = {}): InstanceDetailData {
  return {
    instance: {
      id: "pi-1",
      definitionId: "invoice:1:abc",
      businessKey: "INV-7",
      suspended: false,
      ended: false,
    },
    activityTree: null,
    variables: { amount: { value: 42, type: "Integer" } },
    incidents: [],
    incidentCount: 0,
    bpmnXml: null,
    activeActivityIds: ["review"],
    incidentActivityIds: [],
    openTasks: [task("review", "Review invoice")],
    openTaskCount: 1,
    engineId: "prod",
    ...over,
  }
}

/** A failed job of the instance — its remedy is Retry. */
export const FAILED_JOB_INCIDENT: IncidentInstance = {
  id: "inc-1",
  processInstanceId: "pi-1",
  incidentType: "failedJob",
  incidentMessage: "Card declined",
  incidentTimestamp: "2026-10-10T08:00:00.000+0000",
  cockpitInstanceUrl: null,
  recovery: { action: "retry-job", jobId: "job-1" },
}

export type Calls = Array<[string, Record<string, unknown>]>

export function recorder(
  calls: Calls,
  name: string,
  answer: (args: Record<string, unknown>) => unknown,
) {
  return {
    [name]: (args: Record<string, unknown>) => {
      calls.push([name, args])
      return answer(args)
    },
  }
}

export const Standalone = InstanceDetailWidget as unknown as ComponentType<Record<string, unknown>>
export const InCockpit: ComponentType<Record<string, unknown>> = () => (
  <InstanceDetailWidget processInstanceId="pi-1" engine="prod" />
)

export function renderInstance(
  widget: ComponentType<Record<string, unknown>>,
  data: InstanceDetailData | null,
  tools: Record<string, unknown>,
  onModelContext?: (text: string) => void,
) {
  return render(
    <WidgetFixtureHost
      widget={widget}
      data={(data ?? {}) as unknown as Record<string, unknown>}
      tools={{ [CAMUNDA7_WIDGET_ACTIONS_DATA]: admin, ...tools }}
      onModelContext={onModelContext}
    />,
  )
}

export async function completeTheOpenTask() {
  fireEvent.click(await screen.findByRole("button", { name: "Complete" }))
  fireEvent.click(await screen.findByRole("button", { name: "Complete task" }))
}

export const feedCalls = (calls: Calls) =>
  calls.filter(([name]) => name === CAMUNDA7_INSTANCE_DETAIL_DATA)

/** Radix tabs switch on mouse-down (and focus), not on click. */
export function openTab(name: RegExp) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }))
}

/** Answer the open confirmation with `dialogButton` and wait for it to close. */
export async function confirmIn(dialogButton: string) {
  const dialog = await screen.findByRole("dialog")
  fireEvent.click(within(dialog).getByRole("button", { name: dialogButton }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
}
