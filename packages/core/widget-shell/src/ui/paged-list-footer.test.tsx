// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { LocaleProvider } from "@miragon/mcp-toolkit-ui"
import { PagedListFooter } from "./paged-list-footer.js"
import { PagedRows } from "./paged-rows.js"
import type { PagedViewData } from "./use-paged-view-data.js"

afterEach(() => cleanup())

/** A settled page 0 of the current filter: two of three rows, nothing in flight. */
function paged(overrides: Partial<PagedViewData<string, object>> = {}) {
  return {
    items: ["a", "b"],
    firstPage: {},
    total: 3,
    stale: false,
    hasMore: true,
    loadMore: vi.fn(),
    loading: false,
    refreshing: false,
    loadingMore: false,
    error: null,
    retry: vi.fn(),
    loadMoreError: null,
    ...overrides,
  } satisfies PagedViewData<string, object>
}

function renderList(state: PagedViewData<string, object>) {
  render(
    <>
      <PagedRows paged={state}>
        <p>rows</p>
      </PagedRows>
      <PagedListFooter paged={state} noun="items" />
    </>,
  )
  return { rows: screen.getByText("rows").parentElement!, status: screen.getByRole("status") }
}

/**
 * While a new search or filter is in flight (or has failed) the list keeps the
 * previous result on screen (`stale`). A sighted operator must SEE that —
 * a marked list (a bar in the state's tone, info in flight, warning once it
 * failed; never a dimming that drops muted text under AA), a visible
 * "Updating…" — and no "Showing X of Y" may pair the previous count with the
 * new search (#341 review).
 */
describe("PagedListFooter + PagedRows — the stale and in-flight states", () => {
  it("a settled page: count shown, status for screen readers only, rows not marked", () => {
    const { rows, status } = renderList(paged())
    expect(screen.getByText("Showing 2 of 3 items")).toBeTruthy()
    expect(status.className).toBe("sr-only")
    expect(status.textContent).toBe("2 / 3 items")
    expect(rows.getAttribute("aria-busy")).toBe("false")
    expect(rows.hasAttribute("data-stale")).toBe(false)
    expect(rows.querySelector("[data-tone]")).toBeNull()
    expect(rows.className).not.toContain("opacity")
  })

  it("a new search in flight: a VISIBLE Updating… line, busy rows marked info, no count", () => {
    const { rows, status } = renderList(paged({ stale: true, refreshing: true, hasMore: false }))
    expect(status.className).not.toContain("sr-only")
    expect(status.textContent).toBe("Updating…")
    expect(rows.getAttribute("aria-busy")).toBe("true")
    expect(rows.getAttribute("data-stale")).toBe("true")
    expect(rows.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe("info")
    expect(rows.className).not.toContain("opacity")
    expect(screen.queryByText(/Showing/)).toBeNull()
  })

  it("a failed search: the rows stay marked (warning), the failure says so, still no count", () => {
    const state = paged({ stale: true, hasMore: false, error: new Error("engine down") })
    const { rows, status } = renderList(state)
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain(
      "Could not update the list (engine down). You are seeing the previous result.",
    )
    expect(rows.getAttribute("data-stale")).toBe("true")
    expect(rows.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe("warning")
    expect(status.className).toBe("sr-only")
    expect(status.textContent).toBe("")
    expect(screen.queryByText(/Showing/)).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(state.retry).toHaveBeenCalledTimes(1)
    expect(state.loadMore).not.toHaveBeenCalled()
  })

  it("a same-filter refetch: Updating… is visible, the count of THIS filter stays", () => {
    const { rows, status } = renderList(paged({ refreshing: true }))
    expect(status.textContent).toBe("Updating…")
    expect(status.className).not.toContain("sr-only")
    expect(rows.getAttribute("aria-busy")).toBe("true")
    expect(rows.hasAttribute("data-stale")).toBe(false)
    expect(screen.getByText("Showing 2 of 3 items")).toBeTruthy()
  })
})

/**
 * The footer's own strings are kit defaults: without a caller's texts (a
 * composed-server list) they follow the active locale like the rest of the
 * kit (#339) — the two lines the stale states added included.
 */
describe("PagedListFooter — kit defaults follow the active locale", () => {
  function renderGerman(state: PagedViewData<string, object>) {
    render(
      <LocaleProvider locale="de">
        <PagedListFooter paged={state} noun="Einträge" />
      </LocaleProvider>,
    )
  }

  it("in flight: Wird aktualisiert…", () => {
    renderGerman(paged({ stale: true, refreshing: true, hasMore: false }))
    expect(screen.getByRole("status").textContent).toBe("Wird aktualisiert…")
  })

  it("a failed page 0 and a failed load-more, each with the German retry", () => {
    renderGerman(
      paged({
        stale: true,
        error: new Error("weg"),
        loadMoreError: new Error("Zeitüberschreitung"),
      }),
    )
    const [refresh, more] = screen.getAllByRole("alert")
    expect(refresh.textContent).toContain(
      "Die Liste konnte nicht aktualisiert werden (weg). Du siehst das vorherige Ergebnis.",
    )
    expect(more.textContent).toContain(
      "Weitere Einträge konnten nicht geladen werden (Zeitüberschreitung).",
    )
    expect(screen.getAllByRole("button", { name: "Erneut versuchen" })).toHaveLength(2)
  })
})
