// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, render, screen } from "@testing-library/react"
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
