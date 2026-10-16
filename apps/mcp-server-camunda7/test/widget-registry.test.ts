import { describe, expect, it } from "vitest"
import { collectLayoutWidgets } from "@miragon/mcp-toolkit-core"
import { definition as camunda7Definition } from "@miragon/pulse-camunda7-connector/definition"
import { definition as analyticsDefinition } from "@miragon/pulse-analytics-connector/definition"
import { cockpitViews } from "@miragon/pulse-camunda7-connector/widgets"
import { shellDefinition } from "@miragon/pulse-widget-shell/server"
import {
  filterLayoutToWidgets,
  settingsLayout,
  SHELL_SETTINGS_PAGE_WIDGET,
} from "@miragon/pulse-widget-shell/widgets"
import { widgetRegistry } from "../src/ui/widget-registry.js"

/**
 * Closes link 3 of the four-link widget chain: the per-module
 * catalogue-sync tests guard registry ↔ definition inside each package, but
 * nothing guarded that the host bundle map actually spreads every module's
 * widgets. A widget id catalogued in a module definition but absent here
 * renders as an empty slot in the host UI.
 */
/** Every widget id the composed catalogues declare: both modules and the shell. */
const catalogued = [
  ...camunda7Definition.widgets.map((w) => w.id),
  ...analyticsDefinition.widgets.map((w) => w.id),
  ...shellDefinition.widgets.map((w) => w.id),
]

describe("host widget registry covers the module catalogues", () => {
  it("has an entry for every widget id declared by the modules and the shell", () => {
    const missing = catalogued.filter((id) => !(id in widgetRegistry))
    expect(missing).toEqual([])
  })
})

/**
 * The settings page (the shell's, #346) composes the shell's language section
 * and one section widget per module, and it assembles that layout from THIS
 * host's widget registry (`settingsLayout`, by the `<module>:settings`
 * convention) — so the page extends to modules no package has heard of. Its
 * failure modes stay SILENT: a section whose widget never reaches the host
 * registry is simply absent from the page, and an id that resolves nowhere is
 * dropped by `filterLayoutToWidgets`.
 * Every other check stays green either way, so this test is the only thing
 * standing between a shipped settings section and an invisible one.
 *
 * This test lives in the app because only the composition root may see both
 * module catalogues at once (modules are peers and never import each other).
 */
describe("settings page composes every module's settings section", () => {
  // The runtime input: the ids this host bundle can render, in registration
  // order — exactly what the page reads from the host registry.
  const hostWidgetIds = Object.keys(widgetRegistry)
  const settingsLayoutOf = (widgetIds: string[]) => settingsLayout(widgetIds)
  const sectionIds = collectLayoutWidgets(settingsLayoutOf(hostWidgetIds))

  /** The convention that identifies a settings section in a catalogue: `<module>:settings`. */
  const cataloguedSections = catalogued.filter((id) => id.endsWith(":settings"))

  it("is what the cockpit's settings tab renders, and the host bundles it", () => {
    expect(collectLayoutWidgets(cockpitViews.settings({ engine: "prod-a" }))).toEqual([
      SHELL_SETTINGS_PAGE_WIDGET,
    ])
    expect(widgetRegistry).toHaveProperty(SHELL_SETTINGS_PAGE_WIDGET)
  })

  it("leads with the shell's language section", () => {
    expect(sectionIds[0]).toBe("shell:settings")
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
    // The runtime path: HostWidgetsProvider resolves the raw ids and
    // filterLayoutToWidgets drops whatever it can't. With every module mounted,
    // nothing may be dropped.
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

  it("extends to a CUSTOM module's section without an edit anywhere else", () => {
    // What a composed server (the starter template) relies on: register a
    // `<module>:settings` widget in the host bundle and the page grows a row.
    const CustomSection = () => null
    const withCustomModule = { ...widgetRegistry, "acme:settings": CustomSection }
    const composed = collectLayoutWidgets(
      filterLayoutToWidgets(settingsLayoutOf(Object.keys(withCustomModule)), withCustomModule),
    )
    expect(composed).toEqual([...sectionIds, "acme:settings"])
  })
})
