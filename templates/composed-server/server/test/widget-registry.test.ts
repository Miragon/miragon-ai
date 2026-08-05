import { describe, expect, it } from "vitest"
import { collectLayoutWidgets } from "@miragon/mcp-toolkit-core"
import { definition as camunda7Definition } from "@miragon-ai/mcp-camunda7/definition"
import { definition as analyticsDefinition } from "@miragon-ai/mcp-analytics/definition"
import { definition as notesDefinition } from "@acme/mcp-notes/definition"
import { cockpitViews, filterLayoutToWidgets } from "@miragon-ai/mcp-camunda7/widgets"
import { widgetRegistry } from "../src/ui/widget-registry.js"

/**
 * Closes link 3 of the four-link widget chain: the per-module catalogue-sync
 * tests guard registry ↔ definition inside each package, but nothing else
 * guards that the host bundle map actually spreads every composed module's
 * widgets. A widget id catalogued in a module definition but absent here
 * renders as an empty slot in the host UI. When you add a module to MODULES
 * in src/setup.ts, add its definition to this list too.
 */
describe("host widget registry covers the module catalogues", () => {
  const catalogued = [
    ...camunda7Definition.widgets.map((w) => w.id),
    ...analyticsDefinition.widgets.map((w) => w.id),
    ...notesDefinition.widgets.map((w) => w.id),
  ]

  it("has an entry for every widget id declared by the composed modules", () => {
    const missing = catalogued.filter((id) => !(id in widgetRegistry))
    expect(missing).toEqual([])
  })

  it("keeps the always-registered generic shell widgets", () => {
    expect(widgetRegistry).toHaveProperty("shell:kpi-grid")
    expect(widgetRegistry).toHaveProperty("shell:data-table")
  })
})

/**
 * The settings page composes one section widget per module, and its layout
 * (`cockpitViews.settings`) is a hand-maintained list of RAW cross-module ids
 * living in the camunda7 package. Both of its failure modes are SILENT:
 * forget to add a section and it is simply absent from the settings tab;
 * misspell it and `filterLayoutToWidgets` drops the cell. The convention
 * check below covers every module whose `definition` is listed in this file —
 * add yours to both describe blocks when you add a module.
 */
describe("settings page composes every module's settings section", () => {
  const sectionIds = collectLayoutWidgets(cockpitViews.settings())

  const cataloguedSections = [
    ...camunda7Definition.widgets.map((w) => w.id),
    ...analyticsDefinition.widgets.map((w) => w.id),
    ...notesDefinition.widgets.map((w) => w.id),
  ].filter((id) => id.endsWith(":settings") || id === "camunda7:user-profile")

  it("lists every catalogued settings section (a missing row = an invisible section)", () => {
    const missing = cataloguedSections.filter((id) => !sectionIds.includes(id))
    expect(missing).toEqual([])
  })

  it("only lists ids the host bundle can resolve (a typo = a silently dropped row)", () => {
    const unresolvable = sectionIds.filter((id) => !(id in widgetRegistry))
    expect(unresolvable).toEqual([])
  })

  it("survives filtering against the host registry with all sections intact", () => {
    const filtered = filterLayoutToWidgets(cockpitViews.settings(), widgetRegistry)
    expect(collectLayoutWidgets(filtered)).toEqual(sectionIds)
  })

  it("degrades to the remaining sections when a module is absent", () => {
    // Tier-2 graceful degradation: a host without the analytics module drops
    // that row instead of erroring on an unknown widget id.
    const withoutAnalytics = Object.fromEntries(
      Object.entries(widgetRegistry).filter(([id]) => !id.startsWith("analytics:")),
    )
    const filtered = filterLayoutToWidgets(cockpitViews.settings(), withoutAnalytics)
    const remaining = collectLayoutWidgets(filtered)
    expect(remaining).toContain("camunda7:user-profile")
    expect(remaining.some((id) => id.startsWith("analytics:"))).toBe(false)
  })
})
