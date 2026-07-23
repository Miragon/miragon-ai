import { describe, expect, it } from "vitest"
import { definition as camunda7Definition } from "@miragon-ai/mcp-camunda7/definition"
import { definition as analyticsDefinition } from "@miragon-ai/mcp-analytics/definition"
import { widgetRegistry } from "../src/ui/widget-registry.js"

/**
 * Closes link 3 of the four-link widget chain: the per-module
 * catalogue-sync tests guard registry ↔ definition inside each package, but
 * nothing guarded that the host bundle map actually spreads every module's
 * widgets. A widget id catalogued in a module definition but absent here
 * renders as an empty slot in the host UI.
 */
describe("host widget registry covers the module catalogues", () => {
  const catalogued = [
    ...camunda7Definition.widgets.map((w) => w.id),
    ...analyticsDefinition.widgets.map((w) => w.id),
  ]

  it("has an entry for every widget id declared by the camunda7 and analytics modules", () => {
    const missing = catalogued.filter((id) => !(id in widgetRegistry))
    expect(missing).toEqual([])
  })

  it("keeps the always-registered generic shell widgets", () => {
    expect(widgetRegistry).toHaveProperty("shell:kpi-grid")
    expect(widgetRegistry).toHaveProperty("shell:data-table")
  })
})
