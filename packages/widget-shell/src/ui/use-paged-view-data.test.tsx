// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
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
}

function setup(props: HarnessProps) {
  return renderHook(
    ({ initialData, args }: HarnessProps) =>
      usePagedViewData<string, Page>({
        initialData,
        key: ["test:list"],
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

afterEach(() => cleanup())

describe("usePagedViewData", () => {
  it("serves page 0 from handed-in initialData without self-fetching", () => {
    const { result } = setup({ initialData: page(["a", "b"], 5), args: {} })
    expect(result.current.items).toEqual(["a", "b"])
    expect(result.current.total).toBe(5)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.loading).toBe(false)
    const opts = mocks.useToolQuery.mock.calls[0][3] as { enabled: boolean }
    expect(opts.enabled).toBe(false)
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

  it("surfaces a loadMore error and clears it on retry", async () => {
    mocks.callTool.mockRejectedValueOnce(new Error("boom"))
    const { result } = setup({ initialData: page(["a", "b"], 5), args: {} })

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.error?.message).toBe("boom"))

    let resolveCall!: (value: unknown) => void
    mocks.callTool.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCall = resolve
      }),
    )
    act(() => result.current.loadMore())
    // Cleared eagerly, before the retry resolves.
    expect(result.current.error).toBeNull()

    await act(async () => {
      resolveCall(toolResult(page(["c", "d"], 5)))
      await Promise.resolve()
    })
    expect(result.current.items).toEqual(["a", "b", "c", "d"])
    expect(result.current.error).toBeNull()
  })

  it("stops paging after a short page even when the reported total claims more", async () => {
    mocks.callTool.mockResolvedValueOnce(toolResult(page(["c"], 10)))
    const { result } = setup({ initialData: page(["a", "b"], 10), args: {} })

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toEqual(["a", "b", "c"]))
    expect(result.current.hasMore).toBe(false)
  })
})
