import type { ViewDataResult } from "@miragon/mcp-toolkit-ui/hooks"

/** What a seeded view knows about re-reading the data it shows. */
export interface ViewRefreshState {
  /**
   * A REFETCH of the data on screen failed: the view can no longer confirm it
   * is current (an instance that ended answers 404 now). Set from the
   * refetch's FIRST failed attempt — the toolkit's `failureReason`, while the
   * client still retries (TanStack's default: 3 retries, ~7 s) — not only
   * once `error` lands, so a view gating its writes on it never offers them
   * on an unconfirmed state for the length of the backoff. Null while the
   * data is the feed's latest answer, and null without data (that failure is
   * the load error).
   */
  refreshError: Error | null
  /** A refetch of the data on screen is in flight. */
  refreshing: boolean
}

/**
 * The refresh half of a view whose tool result SEEDS a live feed (the
 * toolkit's `useViewData(…, { initialDataMode: "seed" })`): the toolkit hands
 * out the raw query state (`error`, `failureReason`, `isFetching`), this is
 * the house rule over it — the one place that decides when shown data counts
 * as unconfirmed (`useDetailView`, the engine overview).
 */
export function viewRefreshState(
  view: Pick<ViewDataResult<unknown>, "data" | "error" | "failureReason" | "isFetching">,
): ViewRefreshState {
  const shown = view.data !== null
  return {
    refreshError: shown ? (view.error ?? view.failureReason) : null,
    refreshing: shown && view.isFetching,
  }
}
