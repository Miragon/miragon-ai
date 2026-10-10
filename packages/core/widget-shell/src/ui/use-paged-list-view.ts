import { useState } from "react"
import { useDebouncedValue } from "./use-debounced-value.js"
import { usePagedViewData, type PagedViewData } from "./use-paged-view-data.js"

export interface PagedListView<TItem, TData> {
  paged: PagedViewData<TItem, TData>
  /** Raw (undebounced) search input value — bind to the FilterBar. */
  search: string
  setSearch: (next: string) => void
  /** The debounced, trimmed value the feed was actually queried with. */
  debouncedSearch: string
  /**
   * True when the rows on screen are a searched or filtered result (the
   * handed-in page 0 is dropped, the list is server-filtered). Drives "no
   * match" empty states, so it describes the rows SHOWN: while a new page 0
   * is in flight or has failed (`paged.stale`) it stays the previous
   * result's — an empty unfiltered list never reads "no match" for a search
   * that has not answered.
   */
  interacted: boolean
}

/**
 * The paged-list scaffold on top of {@link usePagedViewData}: owns the search
 * box state, its 300 ms debounce, the server-side search arg, and the
 * "once the operator interacts, drop the handed-in page and self-fetch the
 * server-filtered set" rule — the block every searchable list used to repeat.
 *
 * The search is SERVER-side by design: `searchArg` becomes a feed query param,
 * so it covers the whole result set, not just the loaded page. Any change
 * resets pagination to page 0 (via the underlying hook's args identity).
 */
export function usePagedListView<TItem, TData>(opts: {
  initialData: TData | null | undefined
  /** Stable cache-key prefix (e.g. ["camunda7:process-instances", engine]). */
  key: ReadonlyArray<unknown>
  tool: string
  /** Filter args WITHOUT the search value; changing these resets paging. */
  args: Record<string, unknown>
  /** Feed arg carrying the debounced search value (e.g. "businessKeyLike").
   *  Omit for lists without a search box. */
  searchArg?: string
  /** Additional non-search filters (e.g. chips) that must also drop the
   *  handed-in unfiltered page 0. */
  filtersActive?: boolean
  pageSize: number
  /** Gate the self-fetch until the required scope is present. */
  ready: boolean
  selectItems: (data: TData) => TItem[]
  selectTotal: (data: TData) => number
}): PagedListView<TItem, TData> {
  const {
    initialData,
    key,
    tool,
    args,
    searchArg,
    filtersActive = false,
    pageSize,
    ready,
    selectItems,
    selectTotal,
  } = opts
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search.trim(), 300)

  const requested = debouncedSearch !== "" || filtersActive
  const effectiveArgs =
    searchArg && debouncedSearch !== "" ? { ...args, [searchArg]: debouncedSearch } : args

  const paged = usePagedViewData<TItem, TData>({
    // Standalone data is only the unfiltered first page — a filtered view must
    // come from the feed.
    initialData: requested ? null : initialData,
    key,
    tool,
    args: effectiveArgs,
    pageSize,
    ready,
    selectItems,
    selectTotal,
  })

  // The rows on screen answer the last SETTLED request: its value is recorded
  // whenever the shown page is the current one (render-phase state, replay
  // safe) and kept while the previous result stays on screen.
  const [shownRequested, setShownRequested] = useState(requested)
  if (!paged.stale && shownRequested !== requested) setShownRequested(requested)
  const interacted = paged.stale ? shownRequested : requested

  return { paged, search, setSearch, debouncedSearch, interacted }
}
