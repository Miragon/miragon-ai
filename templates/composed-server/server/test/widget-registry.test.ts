import { describe, expect, it } from "vitest"
import { collectLayoutWidgets } from "@miragon/mcp-toolkit-core"
import { definition as camunda7Definition } from "@miragon-ai/camunda7-connector/definition"
import { definition as analyticsDefinition } from "@miragon-ai/analytics-connector/definition"
import { definition as notesDefinition } from "@acme/mcp-notes/definition"
import { cockpitViews, filterLayoutToWidgets } from "@miragon-ai/camunda7-connector/widgets"
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
 * The settings page composes one section widget per module and assembles that
 * layout from THIS server's widget registry: every widget id ending in
 * `:settings` gets a row, in registration order — YOUR module's section
 * included, with no edit in the camunda7 package. The failure mode stays
 * SILENT: a section whose widget never reaches `widgetRegistry` is simply
 * absent from the settings tab. The convention check below covers every module
 * whose `definition` is listed in this file — add yours to both describe
 * blocks when you add a module.
 */
describe("settings page composes every module's settings section", () => {
  // What the cockpit passes at runtime: the ids this bundle can render.
  const hostWidgetIds = Object.keys(widgetRegistry)
  // The runtime call path; the settings view ignores the route params.
  const settingsLayoutOf = (widgetIds: string[]) =>
    cockpitViews.settings({ engine: "prod-a" }, { widgetIds })
  const sectionIds = collectLayoutWidgets(settingsLayoutOf(hostWidgetIds))

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
    const filtered = filterLayoutToWidgets(settingsLayoutOf(hostWidgetIds), widgetRegistry)
    expect(collectLayoutWidgets(filtered)).toEqual(sectionIds)
  })

  it("degrades to the remaining sections when a module is absent", () => {
    // Tier-2 graceful degradation: a host without the analytics module renders
    // no analytics section instead of erroring on an unknown widget id.
    const withoutAnalytics = Object.fromEntries(
      Object.entries(widgetRegistry).filter(([id]) => !id.startsWith("analytics:")),
    )
    const filtered = filterLayoutToWidgets(
      settingsLayoutOf(Object.keys(withoutAnalytics)),
      withoutAnalytics,
    )
    const remaining = collectLayoutWidgets(filtered)
    expect(remaining).toContain("camunda7:user-profile")
    expect(remaining.some((id) => id.startsWith("analytics:"))).toBe(false)
  })

  it("grows a row for a custom module's `<module>:settings` widget", () => {
    // The extension point: give your section widget the `<module>:settings` id
    // and spread your module's widget map into `widgetRegistry` — the settings
    // tab picks it up. The stand-in id belongs to no composed module on purpose
    // (NOT `notes:settings`): the day mcp-notes grows a real section, that id
    // is already in `sectionIds` and the expectation below would demand it
    // twice — a correct change turning this test red.
    const CustomSection = () => null
    const withCustomModule = { ...widgetRegistry, "your-module:settings": CustomSection }
    const composed = collectLayoutWidgets(
      filterLayoutToWidgets(settingsLayoutOf(Object.keys(withCustomModule)), withCustomModule),
    )
    expect(composed).toEqual([...sectionIds, "your-module:settings"])
  })
})
