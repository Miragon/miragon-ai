// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { usePagedListView } from "./use-paged-list-view.js"

// Same stubbing approach as use-paged-view-data.test.tsx: only the toolkit
// hooks' observable surface is needed.
const mocks = vi.hoisted(() => ({
  useToolQuery: vi.fn(),
  callTool: vi.fn(),
}))

vi.mock("@miragon/mcp-toolkit-ui", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useToolQuery: mocks.useToolQuery,
  useCallTool: () => mocks.callTool,
}))

interface Page {
  items: string[]
  total: number
}

const PAGE: Page = { items: ["a", "b"], total: 10 }

function setup(opts?: { initialData?: Page | null; filtersActive?: boolean }) {
  return renderHook(
    ({ filtersActive }: { filtersActive: boolean }) =>
      usePagedListView<string, Page>({
        initialData: opts?.initialData ?? null,
        key: ["test:list"],
        tool: "test_list_data",
        args: { scope: "s1" },
        searchArg: "nameLike",
        filtersActive,
        pageSize: 2,
        ready: true,
        selectItems: (d) => d.items,
        selectTotal: (d) => d.total,
      }),
    { initialProps: { filtersActive: opts?.filtersActive ?? false } },
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.useToolQuery.mockReset()
  mocks.useToolQuery.mockReturnValue({ data: undefined, isError: false, error: null })
  mocks.callTool.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  queryClient.clear()
})

describe("usePagedListView", () => {
  it("adds the debounced, trimmed search value as the server-side search arg", () => {
    const { result } = setup()

    act(() => result.current.setSearch("  ORDER-1 "))
    // Before the debounce elapses the feed still sees the base args.
    let lastArgs = mocks.useToolQuery.mock.lastCall?.[2] as Record<string, unknown>
    expect(lastArgs.nameLike).toBeUndefined()
    expect(result.current.interacted).toBe(false)

    act(() => void vi.advanceTimersByTime(300))
    lastArgs = mocks.useToolQuery.mock.lastCall?.[2] as Record<string, unknown>
    expect(lastArgs).toMatchObject({ scope: "s1", nameLike: "ORDER-1" })
    expect(result.current.interacted).toBe(true)
    expect(result.current.debouncedSearch).toBe("ORDER-1")
  })

  it("drops the handed-in page 0 once a search or filter is active", () => {
    const { result, rerender } = setup({ initialData: PAGE })
    // Unfiltered: the handed-in page renders — as the seed of the unfiltered
    // page-0 query, which stays live for a write's refetch.
    expect(result.current.paged.items).toEqual(["a", "b"])
    expect(mocks.useToolQuery.mock.lastCall?.[3]).toMatchObject({ enabled: true })
    expect(
      queryClient.getQueryData([
        "test:list",
        JSON.stringify({ scope: "s1" }),
        "page0",
        { scope: "s1", firstResult: 0, maxResults: 2 },
      ]),
    ).toBe(PAGE)

    act(() => result.current.setSearch("x"))
    act(() => void vi.advanceTimersByTime(300))
    // The filtered view must come from the feed, not the unfiltered page …
    expect(mocks.useToolQuery.mock.lastCall?.[3]).toMatchObject({ enabled: true })
    // … but until it answers, the handed-in rows stay on screen (#341 N123):
    // the list — and the search box above it — never unmounts mid-search.
    expect(result.current.paged.firstPage).toBe(PAGE)
    expect(result.current.paged.items).toEqual(["a", "b"])
    expect(result.current.paged.loading).toBe(false)

    // Chips (filtersActive) drop the handed-in page the same way.
    act(() => result.current.setSearch(""))
    act(() => void vi.advanceTimersByTime(300))
    rerender({ filtersActive: true })
    expect(mocks.useToolQuery.mock.lastCall?.[3]).toMatchObject({ enabled: true })
  })

  it("`interacted` describes the rows on screen, not a filter that has not answered", () => {
    const EMPTY: Page = { items: [], total: 0 }
    const { result, rerender } = setup({ initialData: EMPTY })
    expect(result.current.interacted).toBe(false)

    // A chip is in flight: the unfiltered (empty) result stays on screen, and
    // its empty state must not read "no match" for a filter nobody answered.
    rerender({ filtersActive: true })
    expect(result.current.paged.stale).toBe(true)
    expect(result.current.interacted).toBe(false)

    // The filtered page lands: the rows on screen are now the filtered set.
    mocks.useToolQuery.mockReturnValue({ data: EMPTY, isError: false, error: null })
    rerender({ filtersActive: true })
    expect(result.current.paged.stale).toBe(false)
    expect(result.current.interacted).toBe(true)
  })

  it("a filtered result on screen still reads as filtered while the unfiltered one loads", () => {
    const ALL: Page = { items: ["a"], total: 1 }
    const FILTERED: Page = { items: [], total: 0 }
    mocks.useToolQuery.mockReturnValue({ data: ALL, isError: false, error: null })
    const { result, rerender } = setup({ initialData: null })
    expect(result.current.interacted).toBe(false)

    // The chip's page lands at once (cached): the filtered set is on screen.
    mocks.useToolQuery.mockReturnValue({ data: FILTERED, isError: false, error: null })
    rerender({ filtersActive: true })
    expect(result.current.paged.stale).toBe(false)
    expect(result.current.interacted).toBe(true)

    // The chip is cleared; the self-fetched unfiltered page 0 is in flight.
    mocks.useToolQuery.mockReturnValue({ data: undefined, isError: false, error: null })
    rerender({ filtersActive: false })
    expect(result.current.paged.firstPage).toBe(FILTERED)
    expect(result.current.paged.stale).toBe(true)
    expect(result.current.interacted).toBe(true)
  })
})
