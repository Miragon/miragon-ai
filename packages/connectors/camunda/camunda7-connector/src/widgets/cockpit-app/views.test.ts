import { describe, expect, it } from "vitest"
import { collectLayoutWidgets } from "@miragon/mcp-toolkit-core"
import { cockpitViews, filterLayoutToWidgets, settingsLayout } from "./views.js"

/** The section ids the settings page would render for a given host registry. */
const sectionsFor = (widgetIds?: string[]) => collectLayoutWidgets(settingsLayout(widgetIds))

describe("settingsLayout", () => {
  it("renders camunda7's own profile panel without any host registry", () => {
    // A host that mounts no HostWidgetsProvider (fixture harnesses, foreign
    // hosts) still gets this module's own section — never an empty page.
    expect(sectionsFor()).toEqual(["camunda7:user-profile"])
    expect(sectionsFor([])).toEqual(["camunda7:user-profile"])
  })

  it("adds a row for every module's `<module>:settings` widget, in registration order", () => {
    expect(
      sectionsFor([
        "camunda7:engine-health",
        "camunda7:user-profile",
        "analytics:settings",
        "shell:kpi-grid",
      ]),
    ).toEqual(["camunda7:user-profile", "analytics:settings"])
  })

  it("picks up a CUSTOM module's section this package has never heard of", () => {
    // The whole point of the self-assembly: a server composed from the
    // published packages contributes its own section by registering the widget
    // — no edit in the camunda7 package.
    expect(sectionsFor(["analytics:settings", "acme:settings"])).toEqual([
      "camunda7:user-profile",
      "analytics:settings",
      "acme:settings",
    ])
  })

  it("orders foreign sections by the host registry, i.e. the composition root's module order", () => {
    expect(sectionsFor(["acme:settings", "analytics:settings"])).toEqual([
      "camunda7:user-profile",
      "acme:settings",
      "analytics:settings",
    ])
  })

  it("matches the convention exactly — a lookalike id contributes no section", () => {
    expect(sectionsFor(["acme:settings-advanced", "acme:settingsfoo", "settings"])).toEqual([
      "camunda7:user-profile",
    ])
  })

  it("lists no section twice when ids repeat across merged registries", () => {
    expect(
      sectionsFor(["analytics:settings", "camunda7:user-profile", "analytics:settings"]),
    ).toEqual(["camunda7:user-profile", "analytics:settings"])
  })

  it("degrades to the remaining sections when a module is absent", () => {
    // Structural now: an inactive module registers no widget, so it
    // contributes no id and therefore no row.
    expect(sectionsFor(["acme:settings"])).toEqual(["camunda7:user-profile", "acme:settings"])
  })
})

describe("cockpitViews.settings", () => {
  // The settings view ignores the route params — engine scope is irrelevant to
  // per-user preferences.
  const params = { engine: "prod-a" }

  it("assembles from the view context the cockpit passes", () => {
    const widgetIds = ["analytics:settings", "acme:settings"]
    expect(collectLayoutWidgets(cockpitViews.settings(params, { widgetIds }))).toEqual(
      collectLayoutWidgets(settingsLayout(widgetIds)),
    )
  })

  it("falls back to camunda7's own section without a context", () => {
    expect(collectLayoutWidgets(cockpitViews.settings(params))).toEqual(["camunda7:user-profile"])
  })
})

describe("filterLayoutToWidgets", () => {
  it("drops cells whose widget id resolves nowhere, and the rows they empty", () => {
    const layout = settingsLayout(["analytics:settings", "acme:settings"])
    const filtered = filterLayoutToWidgets(layout, {
      "camunda7:user-profile": () => null,
      "acme:settings": () => null,
    })
    expect(collectLayoutWidgets(filtered)).toEqual(["camunda7:user-profile", "acme:settings"])
  })

  it("keeps every cell a host can resolve", () => {
    const layout = cockpitViews.overview({ engine: "prod-a" })
    const widgets = Object.fromEntries(
      collectLayoutWidgets(layout).map((id) => [id, () => null] as const),
    )
    expect(collectLayoutWidgets(filterLayoutToWidgets(layout, widgets))).toEqual(
      collectLayoutWidgets(layout),
    )
  })
})
