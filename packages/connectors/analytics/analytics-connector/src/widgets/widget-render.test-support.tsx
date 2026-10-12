import { afterEach, beforeEach, vi } from "vitest"
import type { ComponentType } from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import { LocaleProvider, queryClient } from "@miragon/mcp-toolkit-ui"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"
import { setFormatLocale } from "@miragon-ai/widget-shell/testing"

/**
 * Rendering the analytics widgets as a person reads them, for the DOM suites
 * (`*-widgets.test.tsx`): a widget in a language, at a fixed clock, and the
 * readers those suites share.
 */

export const NOW = "2026-10-10T12:40:00.000Z"
export const AS_OF = "2026-10-10T12:32:00.000Z"

/** Fixes the clock at {@link NOW} and resets the view state after each test. */
export function withWidgetClock() {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(NOW))
  })
  afterEach(() => {
    cleanup()
    queryClient.clear()
    setFormatLocale(undefined)
    vi.useRealTimers()
  })
}

export function renderIn(
  language: "de" | "en",
  Widget: ComponentType<{ data: never }>,
  data: unknown,
) {
  setFormatLocale({
    language,
    locale: language === "de" ? "de-DE" : "en-GB",
    timeZone: "Europe/Berlin",
  })
  return render(
    <LocaleProvider locale={language}>
      <WidgetFixtureHost
        widget={Widget as unknown as ComponentType<Record<string, unknown>>}
        data={data as Record<string, unknown>}
      />
    </LocaleProvider>,
  )
}

const NBSP = String.fromCharCode(0xa0)

/** Text with the formatters' no-break spaces as plain spaces. */
export const plain = (s: string | null | undefined) => s?.replaceAll(NBSP, " ")
export const metaLine = () => plain(document.querySelector("[data-view-meta]")?.textContent)
export const iconOf = (el: HTMLElement) => el.querySelector("svg")?.getAttribute("class") ?? ""

/** The tone of the KPI cell labelled `label` (its dot), or undefined for a neutral one. */
export const kpiTone = (label: string) =>
  screen.getByText(label).closest("[data-tone]")?.getAttribute("data-tone") ?? undefined

/**
 * The column heads, the ones a narrow region hides included: happy-dom has no
 * layout, so every `hideBelow` container query reads as "too narrow".
 */
export const headers = (table: HTMLElement) =>
  within(table)
    .getAllByRole("columnheader", { hidden: true })
    .filter((th) => th.getAttribute("scope") === "col")
    .map((th) => plain(th.textContent)?.trim())
