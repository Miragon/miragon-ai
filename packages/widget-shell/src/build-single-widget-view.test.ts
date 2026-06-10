import { describe, expect, it } from "vitest"
import { buildComposedView, buildSingleWidgetView } from "./build-single-widget-view.js"
import { parseToolResult } from "./ui/parse-tool-result.js"

/**
 * The structuredContent shape produced here is an implicit contract with the
 * toolkit's `McpAppView` shell / `adaptDataWidget`: widget data must live under
 * `context.stepData[<id>]` with `_app` and `_dataType` routing fields. These
 * tests pin that contract.
 */
describe("buildSingleWidgetView", () => {
  const data = { rows: [{ id: "pi-1" }], total: 1 }
  const view = buildSingleWidgetView({
    widget: "process-instances",
    app: "camunda7",
    dataType: "processInstances",
    data,
    title: "Instances",
  })

  it("exposes the data under context.stepData.result with _app/_dataType routing", () => {
    expect(view.structuredContent).toEqual({
      title: "Instances",
      context: {
        keys: {},
        stepIds: ["result"],
        stepData: {
          result: {
            data,
            keys: {},
            _app: "camunda7",
            _dataType: "processInstances",
          },
        },
        errors: [],
      },
      layout: [{ row: [{ widget: "process-instances" }] }],
    })
  })

  it("emits the widget data as JSON on the text channel for refresh callers", () => {
    expect(view.content).toEqual([{ type: "text", text: JSON.stringify(data) }])
    // Round-trip through the toolkit's result parsing used by useToolQuery/useToolMutation.
    expect(parseToolResult(view)).toEqual(data)
  })
})

describe("buildComposedView", () => {
  const layout = [{ row: [{ widget: "kpi-grid" }, { widget: "failure-list" }] }]

  it("keys each entry's step data by id (or result_<index>) with _app/_dataType", () => {
    const view = buildComposedView({
      app: "analytics",
      layout,
      title: "Failure overview",
      entries: [
        { id: "kpis", dataType: "dashboard", data: { totalCount: 5 } },
        { dataType: "failures", data: { patterns: [] } },
      ],
    })

    expect(view.structuredContent.title).toBe("Failure overview")
    expect(view.structuredContent.layout).toEqual(layout)
    expect(view.structuredContent.context).toEqual({
      keys: {},
      stepIds: ["kpis", "result_1"],
      stepData: {
        kpis: {
          data: { totalCount: 5 },
          keys: {},
          _app: "analytics",
          _dataType: "dashboard",
        },
        result_1: {
          data: { patterns: [] },
          keys: {},
          _app: "analytics",
          _dataType: "failures",
        },
      },
      errors: [],
    })
  })

  it("keeps the single-entry text channel flat so in-widget refreshes can parse it", () => {
    const data = { totalCount: 5 }
    const view = buildComposedView({
      app: "analytics",
      layout,
      entries: [{ id: "kpis", dataType: "dashboard", data }],
    })
    expect(view.content).toEqual([{ type: "text", text: JSON.stringify(data) }])
    expect(parseToolResult(view)).toEqual(data)
  })

  it("emits an object keyed by step id on the text channel for multi-entry views", () => {
    const view = buildComposedView({
      app: "analytics",
      layout,
      entries: [
        { id: "kpis", dataType: "dashboard", data: { totalCount: 5 } },
        { dataType: "failures", data: { patterns: [] } },
      ],
    })
    expect(JSON.parse(view.content[0].text)).toEqual({
      kpis: { totalCount: 5 },
      result_1: { patterns: [] },
    })
  })
})
