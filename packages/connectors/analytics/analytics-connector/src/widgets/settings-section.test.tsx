// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { LocaleProvider, queryClient, ToastProvider } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { ANALYTICS_SAVE_SETTINGS, ANALYTICS_SETTINGS_DATA } from "../tool-names.js"
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
  // The kit's error state (U1): the section's own title for a failure the
  // kit cannot classify, what you can do, the raw cause under Details, Retry.
  it("says the settings could not be loaded, and what you can do (de)", async () => {
    renderIn("de")
    expect(
      await screen.findByRole("heading", {
        name: "Die Einstellungen konnten nicht geladen werden.",
      }),
    ).toBeTruthy()
    expect(
      screen.getByText("Versuch es noch mal. Klappt es wieder nicht, frag im Chat nach."),
    ).toBeTruthy()
    expect(screen.getByText("profile store unavailable").closest("details")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy()
    expect(screen.queryByText(/Kennzahlen/)).toBeNull()
  })

  it("says the same in English", async () => {
    renderIn("en")
    expect(
      await screen.findByRole("heading", { name: "Could not load the settings." }),
    ).toBeTruthy()
    expect(screen.getByText("Try again. If it fails again, ask in the chat.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    expect(screen.queryByText(/figures/)).toBeNull()
  })
})

describe("the analytics settings section when it saves (U9: a save is never silent)", () => {
  const VIEW = { settings: { defaultPeriod: "7d", minBucketSize: 5 }, canSave: true }

  function renderSaving(save: () => unknown) {
    return render(
      <LocaleProvider locale="en">
        <ToastProvider>
          <WidgetFixtureHost
            widget={Section}
            tools={{ [ANALYTICS_SETTINGS_DATA]: () => VIEW, [ANALYTICS_SAVE_SETTINGS]: save }}
          />
        </ToastProvider>
      </LocaleProvider>,
    )
  }

  const toast = () => document.querySelector(`[data-slot="toast"]`)

  it("confirms the save in a toast — the polite live region a screen reader hears", async () => {
    renderSaving(() => ({ success: true }))
    fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    await waitFor(() => expect(toast()?.textContent).toContain("Settings saved"))
    expect(toast()?.getAttribute("data-tone")).toBe("success")
    expect(toast()?.closest(`[aria-live="polite"]`)).toBeTruthy()
  })

  it("says why a save failed, in a danger toast", async () => {
    renderSaving(() => {
      throw new Error("Tool analytics_save_settings not found")
    })
    fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    await waitFor(() => expect(toast()?.textContent).toContain("Couldn't save the settings"))
    expect(toast()?.getAttribute("data-tone")).toBe("danger")
    expect(toast()?.textContent).toContain("This data isn't available on this server.")
  })
})
