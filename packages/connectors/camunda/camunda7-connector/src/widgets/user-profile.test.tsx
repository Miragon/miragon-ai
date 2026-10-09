// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ComponentType } from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { defaultUserProfile, type UserProfileView } from "../lib/profile-schema.js"
import { UserProfileWidget } from "./user-profile.js"

afterEach(() => {
  cleanup()
  // The toolkit query client is a singleton — one test's dashboard list must
  // not leak into the next test's picker.
  queryClient.clear()
})

const Widget = UserProfileWidget as unknown as ComponentType<Record<string, unknown>>

function view(overrides: Partial<UserProfileView["profile"]> = {}): UserProfileView {
  return {
    profile: { ...defaultUserProfile(), ...overrides },
    availableEngines: [{ id: "default", environment: "default" }],
    canSave: true,
  }
}

function renderWithDashboards(items: unknown[], profileView = view()) {
  render(
    <WidgetFixtureHost
      widget={Widget}
      data={profileView as unknown as Record<string, unknown>}
      tools={{ "list-dashboards": { items } }}
    />,
  )
}

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
    renderWithDashboards([readable])
    // One <option> in the default select, one pin checkbox label.
    expect(await screen.findAllByText("Ops overview")).toHaveLength(2)
  })

  it("lists pinned dashboards first", async () => {
    const pinned = { id: "d-pinned", name: "pinned", title: "Pinned board" }
    renderWithDashboards([readable, pinned], view({ pinnedDashboardIds: ["d-pinned"] }))
    await screen.findAllByText("Pinned board")
    expect(
      screen
        .getAllByRole("checkbox", { name: /board|overview/ })
        .map((c) => c.closest("label")?.textContent),
    ).toEqual(["Pinned board", "Ops overview"])
  })

  it("leaves unreadable dashboards out of the default select and the pins", async () => {
    renderWithDashboards([readable, unreadable])
    expect(await screen.findAllByText("Ops overview")).toHaveLength(2)
    expect(screen.queryByText(unreadable.name)).toBeNull()
    expect(screen.getAllByRole("checkbox", { name: /Ops overview/ })).toHaveLength(1)
  })

  it("shows the empty state when every listed dashboard is unreadable", async () => {
    renderWithDashboards([unreadable])
    await dashboardsSettled()
    expect(await screen.findByText("No saved dashboards yet.")).toBeTruthy()
    expect(screen.queryByText(unreadable.name)).toBeNull()
  })
})
