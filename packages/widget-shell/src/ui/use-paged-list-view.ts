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
  /** True once a search or filter is active — the handed-in page 0 is dropped
   *  and the list is server-filtered. Drives "no match" empty states. */
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

  const interacted = debouncedSearch !== "" || filtersActive
  const effectiveArgs =
    searchArg && debouncedSearch !== "" ? { ...args, [searchArg]: debouncedSearch } : args

  const paged = usePagedViewData<TItem, TData>({
    // Standalone data is only the unfiltered first page — a filtered view must
    // come from the feed.
    initialData: interacted ? null : initialData,
    key,
    tool,
    args: effectiveArgs,
    pageSize,
    ready,
    selectItems,
    selectTotal,
  })

  return { paged, search, setSearch, debouncedSearch, interacted }
}
