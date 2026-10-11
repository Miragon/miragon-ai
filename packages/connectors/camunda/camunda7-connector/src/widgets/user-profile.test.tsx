// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { CAMUNDA7_SAVE_USER_PROFILE } from "../tool-names.js"
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
    language: "en",
    theme: "system",
    updatedAt: "2026-10-01T00:00:00.000Z",
    defaultEngineId: "prod-a",
    allowedEngineIds: [],
    pinnedDashboardIds: [],
    preferredRole: "admin",
  },
  availableEngines: [
    { id: "prod-a", environment: "default" },
    { id: "prod-b", environment: "default" },
  ],
  canSave: true,
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
        [CAMUNDA7_SAVE_USER_PROFILE]: (args: Record<string, unknown>) => {
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
  it("a theme change sends the theme alone, never the (possibly stale) default engine", async () => {
    const { save } = renderPanel()
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "dark" } })
    expect(await save()).toEqual({ theme: "dark" })
  })

  it("making an engine the default is the explicit write", async () => {
    const { save } = renderPanel()
    fireEvent.change(screen.getByLabelText("Default engine"), { target: { value: "prod-b" } })
    expect(await save()).toEqual({ defaultEngineId: "prod-b" })
  })

  it("narrowing the engine curation also clears a default it excludes", async () => {
    const { save } = renderPanel()
    fireEvent.click(screen.getByRole("checkbox", { name: "prod-a" }))
    expect(await save()).toEqual({ allowedEngineIds: ["prod-b"], defaultEngineId: "" })
  })

  it("unchecking and re-checking an engine is no change", async () => {
    const { save } = renderPanel()
    fireEvent.click(screen.getByRole("checkbox", { name: "prod-b" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "prod-b" }))
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "de" } })
    expect(await save()).toEqual({ language: "de" })
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

  // Standalone (camunda7_show_user_profile) the panel's view is the seed of
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
    const { save } = renderPanel()
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "dark" } })
    expect(await save()).toEqual({ theme: "dark" })
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "de" } })
    expect(await save()).toEqual({ language: "de" })
  })

  it("offers following the chat app's language as a choice of its own (#339)", async () => {
    const { save } = renderPanel()
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "system" } })
    expect(screen.getByRole("option", { name: "Automatic (follows the chat app)" })).toBeTruthy()
    expect(await save()).toEqual({ language: "system" })
  })

  it("never sends an unset role (the stored role stays)", async () => {
    const { save } = renderPanel()
    fireEvent.change(screen.getByLabelText("Preferred role"), { target: { value: "" } })
    expect(await save()).toEqual({})
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
