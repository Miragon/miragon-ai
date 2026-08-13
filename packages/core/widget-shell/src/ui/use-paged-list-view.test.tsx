// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
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
    // Unfiltered: the handed-in page renders, no self-fetch.
    expect(result.current.paged.items).toEqual(["a", "b"])
    expect(mocks.useToolQuery.mock.lastCall?.[3]).toMatchObject({ enabled: false })

    act(() => result.current.setSearch("x"))
    act(() => void vi.advanceTimersByTime(300))
    // The filtered view must come from the feed, not the unfiltered page.
    expect(mocks.useToolQuery.mock.lastCall?.[3]).toMatchObject({ enabled: true })
    expect(result.current.paged.items).toEqual([])

    // Chips (filtersActive) drop the handed-in page the same way.
    act(() => result.current.setSearch(""))
    act(() => void vi.advanceTimersByTime(300))
    rerender({ filtersActive: true })
    expect(result.current.interacted).toBe(true)
    expect(mocks.useToolQuery.mock.lastCall?.[3]).toMatchObject({ enabled: true })
  })
})
