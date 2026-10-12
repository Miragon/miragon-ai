// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { CAMUNDA7_SAVE_SETTINGS, CAMUNDA7_SETTINGS_DATA } from "../tool-names.js"
import type { UserProfileView } from "../lib/profile-schema.js"
import { UserProfileWidget } from "./user-profile.js"

afterEach(() => {
  cleanup()
  // The toolkit query client is a singleton — one test's dashboard list must
  // not leak into the next test's picker.
  queryClient.clear()
})

/** What the panel was rendered from — possibly a cached, stale view. */
const VIEW: UserProfileView = {
  profile: {
    updatedAt: "2026-10-01T00:00:00.000Z",
    defaultEngineId: "prod-a",
    allowedEngineIds: [],
    pinnedDashboardIds: [],
  },
  availableEngines: [
    { id: "prod-a", environment: "default" },
    { id: "prod-b", environment: "default" },
  ],
  canSave: true,
  readOnlyReason: null,
}

/** Switch "Allow all engines" off — the curated engine list appears. */
function curate() {
  fireEvent.click(screen.getByRole("switch", { name: "Allow all engines" }))
}

/** VIEW with profile overrides. */
function viewWith(overrides: Partial<UserProfileView["profile"]>): UserProfileView {
  return { ...VIEW, profile: { ...VIEW.profile, ...overrides } }
}

function renderPanel(view: UserProfileView = VIEW, dashboards: unknown[] = []) {
  const saves: Array<Record<string, unknown>> = []
  const Panel: ComponentType<Record<string, unknown>> = () => <UserProfileWidget data={view} />
  render(
    <WidgetFixtureHost
      widget={Panel}
      data={{}}
      tools={{
        [CAMUNDA7_SAVE_SETTINGS]: (args: Record<string, unknown>) => {
          saves.push(args)
          return { ...view.profile, ...args }
        },
        "list-dashboards": { items: dashboards },
      }}
    />,
  )
  const save = async () => {
    const before = saves.length
    // Not pending: the button reads "Save" again once the previous save settled.
    fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    await waitFor(() => expect(saves).toHaveLength(before + 1))
    return saves[before]
  }
  return { save }
}

describe("UserProfileWidget save — only what the user changed", () => {
  // #346: the UI language is the shell's (its own section on the page).
  it("offers no language setting: the shell's section owns it", () => {
    renderPanel()
    expect(screen.queryByLabelText("Language")).toBeNull()
  })

  it("offers no theme setting: the widgets follow the host's theme", () => {
    renderPanel()
    expect(screen.queryByLabelText("Theme")).toBeNull()
    expect(screen.queryByRole("option", { name: "Dark" })).toBeNull()
  })

  it("making an engine the default is the explicit write", async () => {
    const { save } = renderPanel()
    fireEvent.change(screen.getByLabelText("Default engine"), { target: { value: "prod-b" } })
    expect(await save()).toEqual({ defaultEngineId: "prod-b" })
  })

  it("narrowing the engine curation also clears a default it excludes", async () => {
    const { save } = renderPanel()
    curate()
    fireEvent.click(screen.getByRole("checkbox", { name: "prod-a" }))
    expect(await save()).toEqual({ allowedEngineIds: ["prod-b"], defaultEngineId: "" })
  })

  it("switching 'Allow all engines' off alone changes nothing: every engine stays checked", () => {
    renderPanel()
    curate()
    expect(screen.getByRole("checkbox", { name: "prod-a" })).toHaveProperty("checked", true)
    expect(screen.getByRole("checkbox", { name: "prod-b" })).toHaveProperty("checked", true)
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true)
  })

  it("switching 'Allow all engines' on persists 'all' as []", async () => {
    const { save } = renderPanel(viewWith({ allowedEngineIds: ["prod-a"] }))
    fireEvent.click(screen.getByRole("switch", { name: "Allow all engines" }))
    expect(await save()).toEqual({ allowedEngineIds: [] })
  })

  it("with no engine left, Save is off and the field says why", async () => {
    renderPanel(viewWith({ allowedEngineIds: ["prod-a"] }))
    fireEvent.click(screen.getByRole("checkbox", { name: "prod-a" }))
    expect(await screen.findByText("Pick at least one engine, or allow all engines.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true)
  })

  it("the one save bar: Save stays off until a change, Discard takes it back", () => {
    renderPanel()
    const bar = screen.getByRole("region", { name: "Save settings" })
    expect(bar.textContent).toContain("Engines and dashboards are saved.")
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true)
    expect(screen.queryByRole("button", { name: "Discard changes" })).toBeNull()
    fireEvent.change(screen.getByLabelText("Default engine"), { target: { value: "prod-b" } })
    expect(bar.textContent).toContain("Your changes to engines or dashboards aren't saved yet.")
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false)
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }))
    expect(screen.getByLabelText("Default engine")).toHaveProperty("value", "prod-a")
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true)
  })

  it("unchecking and re-checking an engine is no change", async () => {
    const { save } = renderPanel()
    curate()
    fireEvent.click(screen.getByRole("checkbox", { name: "prod-b" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "prod-b" }))
    fireEvent.change(screen.getByLabelText("Default engine"), { target: { value: "prod-b" } })
    expect(await save()).toEqual({ defaultEngineId: "prod-b" })
  })

  it("widening a curated subset to every engine persists 'all' as []", async () => {
    const { save } = renderPanel(viewWith({ allowedEngineIds: ["prod-a"] }))
    fireEvent.click(screen.getByRole("checkbox", { name: "prod-b" }))
    expect(await save()).toEqual({ allowedEngineIds: [] })
  })

  it("pins a dashboard as a change of its own", async () => {
    const { save } = renderPanel(VIEW, [{ id: "d1", name: "Ops" }])
    fireEvent.click(await screen.findByRole("checkbox", { name: "Ops" }))
    expect(await save()).toEqual({ pinnedDashboardIds: ["d1"] })
  })

  // Standalone (camunda7_show_settings) the panel's view is the seed of
  // the profile feed and stays the ORIGINAL profile until the save's refetch
  // lands (here never — the fixture serves no feed), so the baseline must
  // advance with each save: otherwise reverting a saved change compares equal
  // to the original view and silently saves nothing.
  it("a saved change can be reverted in the same standalone panel", async () => {
    const { save } = renderPanel()
    fireEvent.change(screen.getByLabelText("Default engine"), { target: { value: "prod-b" } })
    expect(await save()).toEqual({ defaultEngineId: "prod-b" })
    fireEvent.change(screen.getByLabelText("Default engine"), { target: { value: "prod-a" } })
    expect(await save()).toEqual({ defaultEngineId: "prod-a" })
  })

  it("a second save sends only what changed since the first", async () => {
    const { save } = renderPanel(VIEW, [{ id: "d1", name: "Ops" }])
    fireEvent.change(screen.getByLabelText("Default engine"), { target: { value: "prod-b" } })
    expect(await save()).toEqual({ defaultEngineId: "prod-b" })
    fireEvent.click(await screen.findByRole("checkbox", { name: "Ops" }))
    expect(await save()).toEqual({ pinnedDashboardIds: ["d1"] })
  })

  // #322 U25: the role was a hint nothing read — the field is gone.
  it("offers no role setting", () => {
    renderPanel()
    expect(screen.queryByLabelText("Preferred role")).toBeNull()
  })

  // The page's outline skips no level: the shell page's title (h1 in the
  // view), this section's h2, then its cards.
  it("heads itself as a section and its cards one step under it", () => {
    renderPanel()
    const outline = screen
      .getAllByRole("heading")
      .map((h) => `${h.tagName.toLowerCase()} ${h.textContent}`)
    expect(outline).toEqual(["h2 Engines and dashboards", "h3 Engines", "h3 Dashboards"])
  })
})

// #322 U25: the read-only reason on top, with the way out.
describe("a read-only panel says why, on top, with the way out", () => {
  it.each([
    ["toolset", /operations toolset/],
    ["noSignIn", /Saving needs a connection with sign-in/],
  ] as const)("%s", (reason, wayOut) => {
    renderPanel({ ...VIEW, canSave: false, readOnlyReason: reason })
    const notice = screen.getByRole("status")
    expect(notice.textContent).toContain("These settings are read-only here")
    expect(notice.textContent).toMatch(wayOut)
    // Above the fields, not under them.
    expect(
      notice.compareDocumentPosition(screen.getByLabelText("Default engine")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByLabelText("Default engine")).toHaveProperty("disabled", true)
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
  })
})

// #346: a section of the shell's page — where camunda7 is bundled but not
// active, its feed's tool is missing and the section is simply not there.
describe("the section where camunda7 is not active", () => {
  it("hides itself when its feed's tool is missing", async () => {
    queryClient.setQueryDefaults(["camunda7:settings"], { retry: false })
    const Section: ComponentType<Record<string, unknown>> = () => <UserProfileWidget />
    const { container } = render(
      <WidgetFixtureHost
        widget={Section}
        data={{}}
        tools={{
          [CAMUNDA7_SETTINGS_DATA]: () => {
            throw new Error(`Tool ${CAMUNDA7_SETTINGS_DATA} not found`)
          },
        }}
      />,
    )
    await waitFor(() =>
      expect(
        queryClient.getQueryCache().find({ queryKey: ["camunda7:settings"], exact: false })?.state
          .status,
      ).toBe("error"),
    )
    expect(container.textContent).toBe("")
  })
})

/** Wait until `list-dashboards` has answered, so an absent entry is a decision. */
async function dashboardsSettled() {
  await waitFor(() =>
    expect(
      queryClient.getQueryCache().find({ queryKey: ["dashboards"], exact: false })?.state.status,
    ).toBe("success"),
  )
}

/**
 * Toolkit 2.6 stores list a record they cannot read (a newer schemaVersion
 * written mid rolling upgrade, a corrupt row) as `{ id, name: id, unreadable }`
 * instead of skipping it. `load-dashboard` refuses such a record, so the
 * picker must not offer it as a default or a pin.
 */
describe("settings dashboard picker", () => {
  const readable = { id: "d-ops", name: "ops", title: "Ops overview" }
  const unreadable = {
    id: "5b0c6f1e-unreadable",
    name: "5b0c6f1e-unreadable",
    unreadable: "schemaVersion 3 is newer than this server supports (2)",
  }

  it("offers readable dashboards as default and pin", async () => {
    renderPanel(VIEW, [readable])
    // One <option> in the default select, one pin checkbox label.
    expect(await screen.findAllByText("Ops overview")).toHaveLength(2)
  })

  it("lists pinned dashboards first", async () => {
    const pinned = { id: "d-pinned", name: "pinned", title: "Pinned board" }
    renderPanel(viewWith({ pinnedDashboardIds: ["d-pinned"] }), [readable, pinned])
    await screen.findAllByText("Pinned board")
    expect(
      screen
        .getAllByRole("checkbox", { name: /board|overview/ })
        .map((c) => c.closest("label")?.textContent),
    ).toEqual(["Pinned board", "Ops overview"])
  })

  it("leaves unreadable dashboards out of the default select and the pins", async () => {
    renderPanel(VIEW, [readable, unreadable])
    expect(await screen.findAllByText("Ops overview")).toHaveLength(2)
    expect(screen.queryByText(unreadable.name)).toBeNull()
    expect(screen.getAllByRole("checkbox", { name: /Ops overview/ })).toHaveLength(1)
  })

  it("shows the empty state when every listed dashboard is unreadable", async () => {
    renderPanel(VIEW, [unreadable])
    await dashboardsSettled()
    expect(
      await screen.findByText("No saved dashboards yet. Have the chat build one and save it."),
    ).toBeTruthy()
    expect(screen.queryByText(unreadable.name)).toBeNull()
  })
})
