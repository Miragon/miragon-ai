// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { LocaleProvider, queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { ANALYTICS_SETTINGS_DATA } from "../tool-names.js"
import { AnalyticsSettingsWidget } from "./settings-section.js"

/**
 * The settings section's own error state: when its feed fails it says the
 * SETTINGS could not be loaded, not the figures a data view loads.
 */

beforeAll(() => {
  // One attempt: the error state is what this suite reads, not the retries.
  queryClient.setQueryDefaults(["analytics:settings"], { retry: false })
})
afterEach(() => {
  cleanup()
  queryClient.clear()
})

/** The section as the settings page mounts it: no pipeline data, it fetches its feed. */
const Section = () => <AnalyticsSettingsWidget />

function renderIn(language: "de" | "en") {
  return render(
    <LocaleProvider locale={language}>
      <WidgetFixtureHost
        widget={Section}
        tools={{
          [ANALYTICS_SETTINGS_DATA]: () => {
            throw new Error("profile store unavailable")
          },
        }}
      />
    </LocaleProvider>,
  )
}

describe("the analytics settings section when its feed fails", () => {
  // Two-part: the toolkit's AlertTitle clamps to one line, so what you can do
  // sits under the cause, never in the title.
  it("says the settings could not be loaded, and what you can do (de)", async () => {
    renderIn("de")
    expect(await screen.findByText("Die Einstellungen konnten nicht geladen werden.")).toBeTruthy()
    expect(screen.getByText("Aktualisier die Ansicht.")).toBeTruthy()
    expect(screen.queryByText(/Kennzahlen/)).toBeNull()
  })

  it("says the same in English", async () => {
    renderIn("en")
    expect(await screen.findByText("Could not load the settings.")).toBeTruthy()
    expect(screen.getByText("Refresh the view.")).toBeTruthy()
    expect(screen.queryByText(/figures/)).toBeNull()
  })
})
