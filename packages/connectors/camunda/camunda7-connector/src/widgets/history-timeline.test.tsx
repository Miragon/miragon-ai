// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { HistoryTimelineWidget } from "./history-timeline.js"
import type { HistoryTimelineData } from "../view-models.js"

afterEach(cleanup)

const DATA: HistoryTimelineData = {
  processInstance: {
    id: "pi-1",
    processDefinitionKey: "invoice",
    processDefinitionName: "Invoice Process",
    startTime: "2026-01-01T10:00:00.000Z",
    endTime: "2026-01-01T10:05:00.000Z",
    durationInMillis: 300_000,
    state: "COMPLETED",
  },
  activities: [
    {
      id: "a1",
      activityId: "start",
      activityName: "Start",
      activityType: "startEvent",
      startTime: "2026-01-01T10:00:00.000Z",
      endTime: "2026-01-01T10:00:00.000Z",
      durationInMillis: 0,
      assignee: null,
      taskId: null,
    },
    {
      id: "a2",
      activityId: "review",
      activityName: "Review Invoice",
      activityType: "userTask",
      startTime: "2026-01-01T10:00:00.000Z",
      endTime: "2026-01-01T10:02:00.000Z",
      durationInMillis: 120_000,
      assignee: "demo",
      taskId: "t1",
    },
  ],
  totalActivities: 2,
  engineId: "default",
}

// WidgetFixtureHost accepts raw single-data widgets (`({ data }) => …`); the
// fixture-host prop type is intentionally loose, so widen here.
const Widget = HistoryTimelineWidget as unknown as ComponentType<Record<string, unknown>>

describe("HistoryTimelineWidget (fixture render)", () => {
  it("renders the process header and per-activity rows from fixture data", () => {
    render(<WidgetFixtureHost widget={Widget} data={DATA as unknown as Record<string, unknown>} />)

    // Process header (processInstance.processDefinitionName + state badge).
    expect(screen.getByText("Invoice Process")).toBeTruthy()
    expect(screen.getByText("COMPLETED")).toBeTruthy()

    // The accessible timeline list and its activity rows.
    expect(screen.getByRole("list", { name: "Activity history timeline" })).toBeTruthy()
    expect(screen.getByText("Review Invoice")).toBeTruthy()
    expect(screen.getByText("userTask")).toBeTruthy()

    // Duration formatting via the shared widget-shell helper: 120_000ms → "2m 0s".
    expect(screen.getByText("2m 0s")).toBeTruthy()
  })

  it("renders the empty state when data is null", () => {
    render(<HistoryTimelineWidget data={null} />)
    expect(screen.getByText("No data available")).toBeTruthy()
  })
})

/**
 * The show tool returns one capped page (maxResults <= 100, like every list):
 * a longer instance's timeline continues through "Load more" on the same
 * engine and instance instead of ending silently at the page boundary.
 */
describe("HistoryTimelineWidget paging", () => {
  const nextActivity = {
    ...DATA.activities[1],
    id: "a3",
    activityId: "archive",
    activityName: "Archive Invoice",
    activityType: "serviceTask",
  }

  it("pages the rest of a long timeline from the history query", async () => {
    const history = vi.fn(() => ({ items: [nextActivity], totalCount: 3 }))
    render(
      <WidgetFixtureHost
        widget={Widget}
        data={{ ...DATA, totalActivities: 3 }}
        tools={{ camunda7_query_historic_activity_instances: history }}
      />,
    )
    expect(screen.getByText("Invoice Process")).toBeTruthy()
    expect(screen.getByText(/Showing 2 of 3 activities/)).toBeTruthy()

    fireEvent.click(screen.getByText("Load more"))

    expect(await screen.findByText("Archive Invoice")).toBeTruthy()
    expect(history).toHaveBeenCalledWith({
      processInstanceId: "pi-1",
      sortBy: "startTime",
      sortOrder: "asc",
      engine: "default",
      firstResult: 2,
      maxResults: 100,
    })
    expect(screen.queryByText("Load more")).toBeNull()
  })

  it("offers no Load more when the page is the whole timeline", () => {
    render(<WidgetFixtureHost widget={Widget} data={DATA as unknown as Record<string, unknown>} />)
    expect(screen.queryByText("Load more")).toBeNull()
  })
})
