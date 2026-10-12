import type { ReactNode } from "react"
import { ErrorState, Skeleton, useLocale } from "@miragon/mcp-toolkit-ui"
import { describeError } from "./describe-error.js"
import { kitLabels } from "./kit-labels.js"
import { LoadingStatus } from "./view-data-state.js"

/**
 * Fallback for self-fetching widgets while their query has no data yet: the
 * skeleton under a polite loading status while loading, and the toolkit's
 * `ErrorState` once the query errored — the branch several dashboard widgets
 * forgot, leaving them on an eternal skeleton after a failed fetch.
 *
 * The error says what happened and what you can do ({@link describeError}:
 * "Die Engine prod ist nicht erreichbar (HTTP 503)", "Prüf, ob die Engine
 * läuft …"), keeps the raw reason collapsed under "Details" and always
 * offers the retry. `errorTitle` names what failed to load in the caller's
 * words; it heads an error the kit cannot classify.
 */
export function QueryFallback({
  isError,
  error,
  onRetry,
  errorTitle,
  loadingText,
  skeleton,
}: {
  isError: boolean
  error?: unknown
  /** Re-run the failed query (its refetch). */
  onRetry: () => void
  /** Caller-localized headline for an unclassified error: what failed, one line. */
  errorTitle?: string
  /** The loading status for screen readers (default: the active locale's "Loading view…"). */
  loadingText?: string
  skeleton: ReactNode
}) {
  const locale = useLocale()
  if (isError) {
    const described = describeError(error, locale, { fallbackTitle: errorTitle })
    return (
      <ErrorState
        title={described.title}
        description={described.hint}
        details={described.details ?? undefined}
        onRetry={onRetry}
      />
    )
  }
  return <LoadingStatus text={loadingText ?? kitLabels(locale).loadingView} skeleton={skeleton} />
}

/** The dashboards' standard table placeholder (bordered card + two bars). */
export function TableSkeleton() {
  return (
    <div className="rounded-lg border p-4">
      <Skeleton className="mb-3 h-5 w-40" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
