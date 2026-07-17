import type { ReactNode } from "react"
import { Alert, AlertDescription, AlertTitle, Skeleton } from "@miragon/mcp-toolkit-ui"

/**
 * Fallback for self-fetching widgets while their query has no data yet:
 * renders the skeleton while loading, and a destructive alert once the query
 * errored — the branch several dashboard widgets forgot, leaving them on an
 * eternal skeleton after a failed fetch.
 */
export function QueryFallback({
  isError,
  error,
  errorTitle,
  skeleton,
}: {
  isError: boolean
  error?: unknown
  /** Caller-localized headline for the error state. */
  errorTitle: string
  skeleton: ReactNode
}) {
  if (isError) {
    const message = error instanceof Error ? error.message : ""
    return (
      <Alert variant="destructive">
        <AlertTitle>{errorTitle}</AlertTitle>
        {message ? <AlertDescription>{message}</AlertDescription> : null}
      </Alert>
    )
  }
  return <>{skeleton}</>
}

/** The dashboards' standard table placeholder (bordered card + two bars). */
export function TableSkeleton() {
  return (
    <div className="rounded-lg border p-4" aria-busy="true">
      <Skeleton className="mb-3 h-5 w-40" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
