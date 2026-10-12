// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { AppQueryProvider, LocaleProvider, queryClient } from "@miragon/mcp-toolkit-ui"
import {
  DEFAULT_INLINE_ROWS,
  InlineBudgetProvider,
  RowsBudgeted,
  inlineRowBudget,
  type InlineBudget,
} from "./inline-budget.js"
import { ListTable } from "./list-table.js"
import { usePagedViewData } from "./use-paged-view-data.js"

/**
 * Inline in a chat a view is a card, not a page (#396): a list shows the head
 * of its rows, says how many there are, and offers the rest — fullscreen
 * where the host offers it, else the next rows in place. Without a host (no
 * budget) every row renders, as before.
 */

afterEach(() => {
  cleanup()
  queryClient.clear()
})

describe("inlineRowBudget", () => {
  it("fits the rows under a list's chrome into the host's height budget, 3 to 10", () => {
    expect(inlineRowBudget(undefined)).toBe(DEFAULT_INLINE_ROWS)
    expect(inlineRowBudget(600)).toBe(7)
    expect(inlineRowBudget(900)).toBe(10)
    expect(inlineRowBudget(5000)).toBe(10)
    expect(inlineRowBudget(400)).toBe(3)
    expect(inlineRowBudget(120)).toBe(3)
    expect(inlineRowBudget(Number.NaN)).toBe(DEFAULT_INLINE_ROWS)
  })
})

describe("a paged list inline", () => {
  interface Page {
    items: string[]
    total: number
  }
  const callTool = vi.fn()
  const toolkitDefaults = queryClient.getDefaultOptions()
  beforeEach(() => {
    callTool.mockReset()
    queryClient.setDefaultOptions({
      ...toolkitDefaults,
      queries: { ...toolkitDefaults.queries, retry: false },
    })
  })
  afterEach(() => queryClient.setDefaultOptions(toolkitDefaults))

  const seed: Page = { items: ["a", "b", "c", "d", "e"], total: 9 }

  function setup(budget: InlineBudget) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppQueryProvider callTool={callTool}>
        <InlineBudgetProvider budget={budget}>{children}</InlineBudgetProvider>
      </AppQueryProvider>
    )
    return renderHook(
      ({ args }: { args: Record<string, unknown> }) =>
        usePagedViewData<string, Page>({
          initialData: seed,
          key: ["test:inline"],
          tool: "test_list_data",
          args,
          pageSize: 5,
          ready: true,
          selectItems: (data) => data.items,
          selectTotal: (data) => data.total,
        }),
      { wrapper, initialProps: { args: {} } },
    )
  }

  it("shows the head of its rows and opens fullscreen for the rest", () => {
    const expand = vi.fn()
    const { result } = setup({ rows: 2, diagramMaxHeight: null, expand })
    expect(result.current.items).toEqual(["a", "b"])
    expect(result.current.total).toBe(9)
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())
    expect(expand).toHaveBeenCalledTimes(1)
    expect(callTool).not.toHaveBeenCalledWith("test_list_data", expect.anything())
  })

  it("without fullscreen, reveals the next rows in place, then fetches the next page", async () => {
    callTool.mockResolvedValue({ structuredContent: { items: ["f", "g", "h", "i"], total: 9 } })
    const { result, rerender } = setup({ rows: 2, diagramMaxHeight: null, expand: null })

    act(() => result.current.loadMore())
    expect(result.current.items).toEqual(["a", "b", "c", "d"])
    act(() => result.current.loadMore())
    expect(result.current.items).toEqual(["a", "b", "c", "d", "e"])
    expect(result.current.hasMore).toBe(true)

    // Every loaded row is shown: the next click fetches, and shows what it fetched.
    await act(async () => result.current.loadMore())
    expect(callTool).toHaveBeenCalledWith("test_list_data", { firstResult: 5, maxResults: 5 })
    expect(result.current.items).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i"])

    // A new filter starts at the head again.
    rerender({ args: { search: "x" } })
    expect(result.current.items.length).toBeLessThanOrEqual(2)
  })

  it("shows every row outside a host", () => {
    const { result } = setup({ rows: null, diagramMaxHeight: null, expand: null })
    expect(result.current.items).toEqual(seed.items)
  })
})

describe("a table inline", () => {
  const rows = ["one", "two", "three", "four", "five"]
  function renderTable(budget: InlineBudget, wrap = (node: ReactNode) => node) {
    return render(
      <LocaleProvider locale="en">
        <InlineBudgetProvider budget={budget}>
          {wrap(
            <ListTable ariaLabel="Things" columns={[{ label: "Name" }]}>
              {rows.map((row) => (
                <tr key={row}>
                  <td>{row}</td>
                </tr>
              ))}
            </ListTable>,
          )}
        </InlineBudgetProvider>
      </LocaleProvider>,
    )
  }
  const shownRows = () =>
    screen
      .getAllByRole("cell")
      .map((cell) => cell.textContent)
      .filter((text) => rows.includes(text ?? ""))

  it("shows the head of its rows, says how many there are and opens fullscreen", () => {
    const expand = vi.fn()
    renderTable({ rows: 2, diagramMaxHeight: null, expand })
    expect(shownRows()).toEqual(["one", "two"])
    expect(screen.getByText("2 of 5 shown")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Show all" }))
    expect(expand).toHaveBeenCalledTimes(1)
  })

  it("without fullscreen, shows the next rows in place", () => {
    renderTable({ rows: 2, diagramMaxHeight: null, expand: null })
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    expect(shownRows()).toEqual(["one", "two", "three", "four"])
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    expect(shownRows()).toEqual(rows)
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull()
  })

  it("never caps rows a paged list already budgeted", () => {
    renderTable({ rows: 2, diagramMaxHeight: null, expand: null }, (node) => (
      <RowsBudgeted>{node}</RowsBudgeted>
    ))
    expect(shownRows()).toEqual(rows)
    expect(screen.queryByText(/shown$/)).toBeNull()
  })

  it("shows every row outside a host", () => {
    renderTable({ rows: null, diagramMaxHeight: null, expand: null })
    expect(shownRows()).toEqual(rows)
  })
})
