import { useState } from "react"
import { queryClient, useToolQuery } from "@miragon/mcp-toolkit-ui"

/** The observable state of a {@link useSeededToolQuery}. */
export interface SeededToolQuery<T> {
  /** The cached answer — the seed until the feed answered. */
  data: T | null
  isError: boolean
  /** The last fetch's failure — set next to `data` when a REFETCH failed. */
  error: Error | null
  /**
   * The current fetch's last failed ATTEMPT — set from the first failure on,
   * while the client still retries (`error` waits for the last retry, ~7 s
   * under TanStack's default 3 retries); cleared when a fetch starts or succeeds.
   */
  failureReason: Error | null
  /** A fetch is in flight (the first one or a refetch). */
  isFetching: boolean
  /** Re-read the feed now (a Retry of an error state, a manual refresh). */
  refetch: () => void
}

/**
 * The content of the last payload seeded per cache key in this client. It
 * outlives the component: a view remounted with the payload it was seeded
 * with must not roll a refetched answer back, while a payload this client
 * has not seen yet is a new delivery from the host and wins.
 */
const lastSeeded = new Map<string, string>()

/** JSON content of a payload — undefined when it cannot be serialized (then always "new"). */
function contentOf(value: unknown): string | undefined {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

/**
 * The toolkit's `useToolQuery` with a SEED: data the view already holds — a
 * `*_show_*` tool result handed in standalone — is written into the query
 * cache as the feed's current answer instead of switching the query off.
 *
 * Why not the toolkit's `useViewData`: it disables the query whenever initial
 * data exists, so a standalone view could never refetch — a write in it (or
 * a sibling) left it showing the pre-write snapshot. Seeded, the query is
 * live in BOTH modes: a fresh seed is not refetched on mount (the show tool
 * just read it — the toolkit's 30 s staleTime), but an invalidation after a
 * write, a Retry or a manual refresh re-reads the feed.
 *
 * A seed lands in the cache when the entry is empty (TanStack's `initialData`
 * rule) or when it is a payload this client has not seeded for the key yet —
 * a new delivery from the host. A re-emitted or remounted OLD payload never
 * overwrites a refetched answer.
 *
 * Writes the toolkit's singleton client, which `AppQueryProvider` (and with
 * it every `useToolQuery`) shares — guaranteed one instance by the host
 * bundle's `resolve.dedupe`. The write happens in the render phase, before
 * the observer below reads the cache (what `initialData` does internally);
 * TanStack notifies observers asynchronously, so no other component is
 * updated during this render.
 *
 * `key`/`args` must be what the self-fetch would use: the effective cache key
 * is `[...key, args]` (`useToolQuery`'s queryKey-vs-args contract), and the
 * args must scope the read to the seed's own engine and target — a standalone
 * view derives them from the seed's echo, never from absent props.
 */
export function useSeededToolQuery<T>(
  key: ReadonlyArray<unknown>,
  tool: string,
  args: Record<string, unknown>,
  { seed, enabled }: { seed: T | null | undefined; enabled: boolean },
): SeededToolQuery<T> {
  const cacheKey = [...key, args]
  const keyId = JSON.stringify(cacheKey)
  // The seed this instance last processed — skips the content check while
  // the same object is handed in render after render.
  const [seen, setSeen] = useState<{ seed: unknown; keyId: string } | null>(null)
  if (seed != null && !(seen && Object.is(seen.seed, seed) && seen.keyId === keyId)) {
    const content = contentOf(seed)
    const delivered = content === undefined || lastSeeded.get(keyId) !== content
    if (delivered || queryClient.getQueryData(cacheKey) === undefined) {
      queryClient.setQueryData(cacheKey, seed)
    }
    if (content !== undefined) lastSeeded.set(keyId, content)
    // Only a real change re-renders: an equal object per render must not loop.
    if (delivered || seen?.keyId !== keyId) setSeen({ seed, keyId })
  }
  const query = useToolQuery<T>([...key], tool, args, { enabled })
  return {
    data: query.data ?? seed ?? null,
    isError: query.isError,
    error: query.error ?? null,
    failureReason: query.failureReason,
    isFetching: query.isFetching,
    refetch: () => void query.refetch(),
  }
}
