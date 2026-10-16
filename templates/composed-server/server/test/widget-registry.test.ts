import { describe, expect, it } from "vitest"
import { collectLayoutWidgets } from "@miragon/mcp-toolkit-core"
import { definition as camunda7Definition } from "@miragon/pulse-camunda7-connector/definition"
import { definition as analyticsDefinition } from "@miragon/pulse-analytics-connector/definition"
import { definition as notesDefinition } from "@acme/mcp-notes/definition"
import { cockpitViews } from "@miragon/pulse-camunda7-connector/widgets"
import { shellDefinition } from "@miragon/pulse-widget-shell/server"
import {
  filterLayoutToWidgets,
  settingsLayout,
  SHELL_SETTINGS_PAGE_WIDGET,
} from "@miragon/pulse-widget-shell/widgets"
import { widgetRegistry } from "../src/ui/widget-registry.js"

/**
 * Closes link 3 of the four-link widget chain: the per-module catalogue-sync
 * tests guard registry ↔ definition inside each package, but nothing else
 * guards that the host bundle map actually spreads every composed module's
 * widgets. A widget id catalogued in a module definition but absent here
 * renders as an empty slot in the host UI. When you add a module to MODULES
 * in src/setup.ts, add its definition to this list too.
 */
const catalogued = [
  ...camunda7Definition.widgets.map((w) => w.id),
  ...analyticsDefinition.widgets.map((w) => w.id),
  ...notesDefinition.widgets.map((w) => w.id),
  ...shellDefinition.widgets.map((w) => w.id),
]

describe("host widget registry covers the module catalogues", () => {
  it("has an entry for every widget id declared by the composed modules and the shell", () => {
    const missing = catalogued.filter((id) => !(id in widgetRegistry))
    expect(missing).toEqual([])
  })
})

/**
 * The settings page (the shell's) leads with the UI language and composes one
 * section widget per module, assembled from THIS server's widget registry:
 * every widget id ending in `:settings` gets a row, in registration order —
 * YOUR module's section included, with no edit in any package. The failure mode stays
 * SILENT: a section whose widget never reaches `widgetRegistry` is simply
 * absent from the settings tab. The convention check below covers every module
 * whose `definition` is listed in this file — add yours to both describe
 * blocks when you add a module.
 */
describe("settings page composes every module's settings section", () => {
  // What the page reads at runtime: the ids this bundle can render.
  const hostWidgetIds = Object.keys(widgetRegistry)
  const settingsLayoutOf = (widgetIds: string[]) => settingsLayout(widgetIds)
  const sectionIds = collectLayoutWidgets(settingsLayoutOf(hostWidgetIds))

  const cataloguedSections = catalogued.filter((id) => id.endsWith(":settings"))

  it("is what the cockpit's settings tab renders, and the bundle has it", () => {
    expect(collectLayoutWidgets(cockpitViews.settings({ engine: "prod-a" }))).toEqual([
      SHELL_SETTINGS_PAGE_WIDGET,
    ])
    expect(widgetRegistry).toHaveProperty(SHELL_SETTINGS_PAGE_WIDGET)
  })

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
    expect(remaining).toContain("camunda7:settings")
    expect(remaining.some((id) => id.startsWith("analytics:"))).toBe(false)
  })

  it("grows a row for a custom module's `<module>:settings` widget", () => {
    // The extension point: give your section widget the `<module>:settings` id
    // and spread your module's widget map into `widgetRegistry` — the settings
    // page picks it up. The stand-in id belongs to no composed module on purpose
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
