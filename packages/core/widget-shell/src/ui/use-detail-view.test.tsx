// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import { AppQueryProvider, queryClient } from "@miragon/mcp-toolkit-ui"
import { useDetailView } from "./use-detail-view.js"
import { useViewData } from "./use-view-data.js"
import { ViewDataState } from "./view-data-state.js"

interface Detail {
  name: string
}

const callTool = vi.fn()
const answer = (name: string) => ({ structuredContent: { name } })

function wrapper({ children }: { children: ReactNode }) {
  return <AppQueryProvider callTool={callTool}>{children}</AppQueryProvider>
}

const toolkitDefaults = queryClient.getDefaultOptions()

beforeEach(() => {
  callTool.mockReset()
  queryClient.setDefaultOptions({
    ...toolkitDefaults,
    queries: { ...toolkitDefaults.queries, retry: false },
  })
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  queryClient.setDefaultOptions(toolkitDefaults)
})

const invalidate = () => act(() => queryClient.invalidateQueries({ queryKey: ["test:detail"] }))

describe("useViewData", () => {
  function setup(seed: Detail | null, ready = true) {
    return renderHook(
      () => useViewData<Detail>(seed, ["test:detail", "x"], "test_detail_data", { id: "x" }, ready),
      { wrapper },
    )
  }

  it("loads while a ready view has nothing to show yet", async () => {
    callTool.mockResolvedValue(answer("fetched"))
    const { result } = setup(null)
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toEqual({ name: "fetched" }))
    expect(result.current.loading).toBe(false)
  })

  it("is neither loading nor fetching before the scope is ready", () => {
    const { result } = setup(null, false)
    expect(result.current.loading).toBe(false)
    expect(callTool).not.toHaveBeenCalled()
  })

  it("reports a failed first load as error, not as a refresh error", async () => {
    callTool.mockRejectedValue(new Error("boom"))
    const { result } = setup(null)
    await waitFor(() => expect(result.current.error?.message).toBe("boom"))
    expect(result.current.loading).toBe(false)
    expect(result.current.refreshError).toBeNull()
  })

  it("flags a refetch in flight and a failed refetch next to the shown seed", async () => {
    let fail!: (error: Error) => void
    callTool.mockReturnValue(new Promise((_, reject) => (fail = reject)))
    const { result } = setup({ name: "seed" })
    expect(result.current.refreshing).toBe(false)
    // Not awaited (the refetch hangs until `fail`), so not inside act either:
    // an open act scope would swallow the next test's updates.
    void queryClient.invalidateQueries({ queryKey: ["test:detail"] })
    await waitFor(() => expect(result.current.refreshing).toBe(true))
    act(() => fail(new Error("gone")))
    await waitFor(() => expect(result.current.refreshError?.message).toBe("gone"))
    expect(result.current.data).toEqual({ name: "seed" })
    expect(result.current.refreshing).toBe(false)
  })
})

function Detail({ seed }: { seed: Detail | null }) {
  const { data, guard, notice, refreshError } = useDetailView<Detail>({
    initialData: seed,
    key: ["test:detail", "x"],
    tool: "test_detail_data",
    args: { id: "x" },
    ready: true,
    loadingText: "Loading…",
    emptyText: "Nothing",
    retryText: "Retry now",
    refreshErrorText: (message) => `Stale: ${message}`,
  })
  if (!data) return guard
  return (
    <div>
      {notice}
      <p>{data.name}</p>
      {!refreshError && <button type="button">Act</button>}
    </div>
  )
}

describe("useDetailView", () => {
  it("offers a Retry on a failed load — never a dead end", async () => {
    callTool.mockRejectedValueOnce(new Error("engine down"))
    render(<Detail seed={null} />, { wrapper })
    expect(await screen.findByText("engine down")).toBeTruthy()

    callTool.mockResolvedValueOnce(answer("loaded"))
    fireEvent.click(screen.getByRole("button", { name: "Retry now" }))
    expect(await screen.findByText("loaded")).toBeTruthy()
  })

  it("says so when a refetch fails over shown data, and retries from the notice", async () => {
    callTool.mockRejectedValueOnce(new Error("instance gone"))
    render(<Detail seed={{ name: "seed" }} />, { wrapper })
    expect(screen.getByRole("button", { name: "Act" })).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()

    await invalidate()
    expect(await screen.findByText("Stale: instance gone")).toBeTruthy()
    expect(screen.getByText("seed")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Act" })).toBeNull()

    callTool.mockResolvedValueOnce(answer("fresh"))
    fireEvent.click(screen.getByRole("button", { name: "Retry now" }))
    expect(await screen.findByText("fresh")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("button", { name: "Act" })).toBeTruthy()
  })

  it("defaults its texts to English", async () => {
    callTool.mockRejectedValueOnce(new Error("gone"))
    function Bare() {
      const { data, guard, notice } = useDetailView<Detail>({
        initialData: { name: "seed" },
        key: ["test:detail", "bare"],
        tool: "test_detail_data",
        args: {},
        ready: true,
        loadingText: "Loading…",
        emptyText: "Nothing",
      })
      return data ? notice : guard
    }
    render(<Bare />, { wrapper })
    await invalidate()
    expect(await screen.findByText("Could not refresh this view: gone")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })
})

describe("ViewDataState", () => {
  it("renders the error with a Retry only when one is offered", () => {
    const onRetry = vi.fn()
    const { rerender } = render(
      <ViewDataState loading={false} error={new Error("x")} loadingText="l" emptyText="e" />,
    )
    expect(screen.queryByRole("button")).toBeNull()
    rerender(
      <ViewDataState
        loading={false}
        error={new Error("x")}
        loadingText="l"
        emptyText="e"
        onRetry={onRetry}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("shows the loading or the empty text without an error", () => {
    const { rerender } = render(
      <ViewDataState loading error={null} loadingText="Loading…" emptyText="Empty" />,
    )
    expect(screen.getByText("Loading…")).toBeTruthy()
    rerender(
      <ViewDataState loading={false} error={null} loadingText="Loading…" emptyText="Empty" />,
    )
    expect(screen.getByText("Empty")).toBeTruthy()
  })
})
