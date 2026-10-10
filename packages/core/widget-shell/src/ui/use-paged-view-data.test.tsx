// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { queryClient } from "@miragon/mcp-toolkit-ui"
import { usePagedViewData } from "./use-paged-view-data.js"

// The toolkit hooks need the host bridge + query provider; the pagination
// logic under test only needs their observable surface, so both are stubbed.
const mocks = vi.hoisted(() => ({
  useToolQuery: vi.fn(),
  callTool: vi.fn(),
}))

vi.mock("@miragon/mcp-toolkit-ui", async (importOriginal) => ({
  // Keep the real module (notably parseToolResult) and stub only the hooks.
  ...(await importOriginal<object>()),
  useToolQuery: mocks.useToolQuery,
  useCallTool: () => mocks.callTool,
}))

interface Page {
  items: string[]
  total: number
}

const page = (items: string[], total: number): Page => ({ items, total })
/** Wire-shaped tool result; the real structured-first parser unwraps it. */
const toolResult = (p: Page) => ({ structuredContent: p })

const selectItems = (data: Page) => data.items
const selectTotal = (data: Page) => data.total

interface HarnessProps {
  initialData: Page | null
  args: Record<string, unknown>
  /** The cache-key scope; defaults to one list. */
  scope?: string
}

function setup(props: HarnessProps) {
  return renderHook(
    ({ initialData, args, scope = "list-1" }: HarnessProps) =>
      usePagedViewData<string, Page>({
        initialData,
        key: ["test:list", scope],
        tool: "test_list_data",
        args,
        pageSize: 2,
        ready: true,
        selectItems,
        selectTotal,
      }),
    { initialProps: props },
  )
}

beforeEach(() => {
  mocks.useToolQuery.mockReset()
  mocks.useToolQuery.mockReturnValue({ data: undefined, isError: false, error: null })
  mocks.callTool.mockReset()
})

afterEach(() => {
  cleanup()
  // The seed lands in the toolkit's singleton client — never across tests.
  queryClient.clear()
})

describe("usePagedViewData", () => {
  it("serves page 0 from handed-in initialData — as the SEED of a live page-0 query", () => {
    const initialData = page(["a", "b"], 5)
    const { result } = setup({ initialData, args: {} })
    expect(result.current.items).toEqual(["a", "b"])
    expect(result.current.total).toBe(5)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.loading).toBe(false)
    // Never switched off: a write's invalidation refetches a standalone list.
    const opts = mocks.useToolQuery.mock.calls[0][3] as { enabled: boolean }
    expect(opts.enabled).toBe(true)
    const page0Key = ["test:list", "list-1", "{}", "page0", { firstResult: 0, maxResults: 2 }]
    expect(queryClient.getQueryData(page0Key)).toBe(initialData)
  })

  it("self-fetches page 0 when no initialData is handed in", () => {
    const { result, rerender } = setup({ initialData: null, args: {} })
    expect(result.current.loading).toBe(true)
    expect(result.current.items).toEqual([])
    expect((mocks.useToolQuery.mock.calls[0][3] as { enabled: boolean }).enabled).toBe(true)

    mocks.useToolQuery.mockReturnValue({ data: page(["a", "b"], 3), isError: false, error: null })
    rerender({ initialData: null, args: {} })
    expect(result.current.loading).toBe(false)
    expect(result.current.items).toEqual(["a", "b"])
  })

  it("appends the next offset on loadMore", async () => {
    mocks.callTool.mockResolvedValueOnce(toolResult(page(["c", "d"], 5)))
    const { result } = setup({ initialData: page(["a", "b"], 5), args: {} })

    act(() => result.current.loadMore())
    expect(result.current.loadingMore).toBe(true)
    await waitFor(() => expect(result.current.items).toEqual(["a", "b", "c", "d"]))
    expect(mocks.callTool).toHaveBeenCalledWith("test_list_data", {
      firstResult: 2,
      maxResults: 2,
    })
    expect(result.current.loadingMore).toBe(false)
    expect(result.current.hasMore).toBe(true)
  })

  it("drops accumulated pages when args change", async () => {
    mocks.callTool.mockResolvedValueOnce(toolResult(page(["c", "d"], 5)))
    const initialData = page(["a", "b"], 5)
    const { result, rerender } = setup({ initialData, args: {} })
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toEqual(["a", "b", "c", "d"]))

    rerender({ initialData, args: { q: "x" } })
    expect(result.current.items).toEqual(["a", "b"])
  })

  it("drops accumulated pages when the self-fetched page 0 refetches", async () => {
    // Self-fetch mode: page 0 from the query, one page appended.
    mocks.useToolQuery.mockReturnValue({ data: page(["a", "b"], 4), isError: false, error: null })
    mocks.callTool.mockResolvedValueOnce(toolResult(page(["c", "d"], 4)))
    const { result, rerender } = setup({ initialData: null, args: {} })
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toEqual(["a", "b", "c", "d"]))

    // A mutation invalidated the cache: page 0 refetches with shifted rows
    // (one row resolved away). Keeping the appended page would duplicate "c".
    mocks.useToolQuery.mockReturnValue({ data: page(["b", "c"], 3), isError: false, error: null })
    rerender({ initialData: null, args: {} })
    expect(result.current.items).toEqual(["b", "c"])
  })

  it("drops accumulated pages when a fresh initialData identity is handed in", async () => {
    mocks.callTool.mockResolvedValueOnce(toolResult(page(["c", "d"], 5)))
    const { result, rerender } = setup({ initialData: page(["a", "b"], 5), args: {} })
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toEqual(["a", "b", "c", "d"]))

    // Host refresh: same filter, new payload object.
    rerender({ initialData: page(["a2", "b2"], 5), args: {} })
    expect(result.current.items).toEqual(["a2", "b2"])
  })

  it("discards an in-flight page across an A→B→A args round-trip", async () => {
    let resolveCall!: (value: unknown) => void
    mocks.callTool.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCall = resolve
      }),
    )
    const initialData = page(["a", "b"], 5)
    const { result, rerender } = setup({ initialData, args: {} })

    act(() => result.current.loadMore())
    expect(result.current.loadingMore).toBe(true)

    rerender({ initialData, args: { q: "b" } })
    rerender({ initialData, args: {} })

    // Resolves at a stale offset for the pre-round-trip filter — must not append.
    await act(async () => {
      resolveCall(toolResult(page(["z1", "z2"], 5)))
      await Promise.resolve()
    })
    expect(result.current.items).toEqual(["a", "b"])
    expect(result.current.loadingMore).toBe(false)
  })

  it("surfaces a loadMore error as loadMoreError and clears it on retry", async () => {
    mocks.callTool.mockRejectedValueOnce(new Error("boom"))
    const { result } = setup({ initialData: page(["a", "b"], 5), args: {} })

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.loadMoreError?.message).toBe("boom"))
    // A load-more failure is not a page-0 failure: the rows above are current.
    expect(result.current.error).toBeNull()

    let resolveCall!: (value: unknown) => void
    mocks.callTool.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCall = resolve
      }),
    )
    act(() => result.current.loadMore())
    // Cleared eagerly, before the retry resolves.
    expect(result.current.loadMoreError).toBeNull()

    await act(async () => {
      resolveCall(toolResult(page(["c", "d"], 5)))
      await Promise.resolve()
    })
    expect(result.current.items).toEqual(["a", "b", "c", "d"])
    expect(result.current.loadMoreError).toBeNull()
  })

  it("stops paging after a short page even when the reported total claims more", async () => {
    mocks.callTool.mockResolvedValueOnce(toolResult(page(["c"], 10)))
    const { result } = setup({ initialData: page(["a", "b"], 10), args: {} })

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toEqual(["a", "b", "c"]))
    expect(result.current.hasMore).toBe(false)
  })
})

/**
 * A new page 0 — a changed search or filter, or a refetch — must never unmount
 * the list (#341 N123): the previous result stays on screen until the new one
 * lands, so the search box above it keeps its focus and keystrokes. A page-0
 * failure is reported as one, with a retry that re-runs page 0 — never as
 * "Failed to load more" with a retry that fetches the next offset (N130).
 */
describe("usePagedViewData — page-0 fetch states", () => {
  const A = page(["a", "b"], 3)
  /** Self-fetch mode with page 0 for `{}` settled to A. */
  function settledOnA() {
    mocks.useToolQuery.mockReturnValue({ data: A, isError: false, error: null, isFetching: false })
    return setup({ initialData: null, args: {} })
  }

  it("keeps the previous result while a changed filter's page 0 is in flight", () => {
    const { result, rerender } = settledOnA()
    expect(result.current.firstPage).toBe(A)

    mocks.useToolQuery.mockReturnValue({
      data: undefined,
      isError: false,
      error: null,
      isFetching: true,
    })
    rerender({ initialData: null, args: { q: "x" } })

    expect(result.current.firstPage).toBe(A)
    expect(result.current.items).toEqual(["a", "b"])
    expect(result.current.total).toBe(3)
    expect(result.current.loading).toBe(false)
    expect(result.current.refreshing).toBe(true)
    expect(result.current.error).toBeNull()
    // The rows on screen belong to the previous filter: no next page of them.
    expect(result.current.hasMore).toBe(false)
    act(() => result.current.loadMore())
    expect(mocks.callTool).not.toHaveBeenCalled()

    // The new page lands and replaces it.
    const B = page(["x1"], 1)
    mocks.useToolQuery.mockReturnValue({ data: B, isError: false, error: null, isFetching: false })
    rerender({ initialData: null, args: { q: "x" } })
    expect(result.current.firstPage).toBe(B)
    expect(result.current.items).toEqual(["x1"])
    expect(result.current.refreshing).toBe(false)
  })

  it("keeps a handed-in page while the first filtered page 0 is in flight", () => {
    mocks.useToolQuery.mockReturnValue({
      data: undefined,
      isError: false,
      error: null,
      isFetching: true,
    })
    const { result, rerender } = setup({ initialData: A, args: {} })
    // Standalone: the search drops the handed-in page, the feed answers it.
    rerender({ initialData: null, args: { q: "x" } })
    expect(result.current.firstPage).toBe(A)
    expect(result.current.loading).toBe(false)
  })

  it("keeps a page that landed AFTER mount (cockpit self-fetch: pending first)", () => {
    const pending = { data: undefined, isError: false, error: null, isFetching: true }
    mocks.useToolQuery.mockReturnValue(pending)
    const { result, rerender } = setup({ initialData: null, args: {} })
    expect(result.current.loading).toBe(true)

    mocks.useToolQuery.mockReturnValue({ data: A, isError: false, error: null, isFetching: false })
    rerender({ initialData: null, args: {} })
    mocks.useToolQuery.mockReturnValue(pending)
    rerender({ initialData: null, args: { q: "x" } })
    expect(result.current.firstPage).toBe(A)
  })

  it("keeps the page the list SHOWS: a handed-in page carried into a new key scope", () => {
    mocks.useToolQuery.mockReturnValue({
      data: undefined,
      isError: false,
      error: null,
      isFetching: true,
    })
    const { result, rerender } = setup({ initialData: A, args: {}, scope: "list-1" })
    // The same handed-in page, now rendered under another scope …
    rerender({ initialData: A, args: {}, scope: "list-2" })
    // … is what that list shows, so its first search keeps it.
    rerender({ initialData: null, args: { q: "x" }, scope: "list-2" })
    expect(result.current.firstPage).toBe(A)
  })

  it("never carries a result over into another list (a changed key scope)", () => {
    const { result, rerender } = settledOnA()
    mocks.useToolQuery.mockReturnValue({
      data: undefined,
      isError: false,
      error: null,
      isFetching: true,
    })
    rerender({ initialData: null, args: {}, scope: "list-2" })
    expect(result.current.firstPage).toBeNull()
    expect(result.current.items).toEqual([])
    expect(result.current.loading).toBe(true)
    expect(result.current.refreshing).toBe(false)
  })

  it("a failed filtered page 0 keeps the previous rows, reports a page-0 error and retries page 0", () => {
    const { result, rerender } = settledOnA()
    const refetch = vi.fn()
    mocks.useToolQuery.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("engine down"),
      isFetching: false,
      refetch,
    })
    rerender({ initialData: null, args: { q: "x" } })

    expect(result.current.firstPage).toBe(A)
    expect(result.current.error?.message).toBe("engine down")
    expect(result.current.loadMoreError).toBeNull()
    act(() => result.current.retry())
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(mocks.callTool).not.toHaveBeenCalled()
  })

  it("a failed background refetch is a page-0 error over the stale rows — never a load-more error", () => {
    const { result, rerender } = settledOnA()
    const refetch = vi.fn()
    // React Query keeps the last data and sets the error.
    mocks.useToolQuery.mockReturnValue({
      data: A,
      isError: true,
      error: new Error("timeout"),
      isFetching: false,
      refetch,
    })
    rerender({ initialData: null, args: {} })

    expect(result.current.items).toEqual(["a", "b"])
    expect(result.current.error?.message).toBe("timeout")
    expect(result.current.loadMoreError).toBeNull()
    act(() => result.current.retry())
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it("an initial page-0 failure has nothing to keep: no rows, the error for the caller's guard", () => {
    mocks.useToolQuery.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("engine down"),
      isFetching: false,
    })
    const { result } = setup({ initialData: null, args: {} })
    expect(result.current.firstPage).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error?.message).toBe("engine down")
  })
})
