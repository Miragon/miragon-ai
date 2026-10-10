import { describe, expect, it } from "vitest"
import { modelContextText } from "@miragon-ai/widget-shell/widgets"
import { liveSurface } from "./lib/hand-off.test-support.js"
import { describeProfile, profileSurface } from "./user-profile-context.js"

const FORM = { language: "en", theme: "dark", defaultDashboardId: "ops-board" }

/** The panel's model context on `operations` (the save tool IS registered there). */
async function contextText(canSave: boolean, dashboardsAnswered = true): Promise<string> {
  const surface = await liveSurface("operations")
  expect(surface.tools).toContain("camunda7_save_user_profile")
  return modelContextText({
    ...describeProfile(FORM, { canSave, allEnginesAllowed: true, allowedEngineCount: 0 }),
    surface: profileSurface(surface, { canSave, dashboardsAnswered }),
  })
}

describe("the profile panel's model context", () => {
  it("names the save tool where the caller can save", async () => {
    const text = await contextText(true)
    expect(text).toContain("preferences can be changed here or via the save tool")
    expect(text).toContain("Tools: camunda7_save_user_profile, load-dashboard")
  })

  // A gateway deployment on camunda7:operations without OAuth registers the
  // save, but no request has an identity to save under: every save refuses.
  it("never names the save tool while preferences are read-only for the caller", async () => {
    const text = await contextText(false)
    expect(text).toContain("preferences are read-only in this deployment")
    expect(text).not.toContain("camunda7_save_user_profile")
    expect(text).toContain("Tools: load-dashboard")
  })

  it("names load-dashboard only once the dashboard tools answered", async () => {
    expect(await contextText(true, false)).toMatch(/\nTools: camunda7_save_user_profile$/)
    expect(await contextText(false, false)).not.toContain("Tools:")
  })

  it("never names the save tool on a deployment that does not register it", async () => {
    const surface = await liveSurface("read-only")
    expect(
      profileSurface(surface, { canSave: true, dashboardsAnswered: true }).has(
        "camunda7_save_user_profile",
      ),
    ).toBe(false)
  })
})
