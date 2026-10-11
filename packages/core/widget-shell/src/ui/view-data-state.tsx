import type { ReactNode } from "react"
import { cn, EmptyState, ErrorState, Skeleton, useLocale } from "@miragon/mcp-toolkit-ui"
import { describeError } from "./describe-error.js"
import { kitLabels } from "./kit-labels.js"

/**
 * The default loading skeleton: a heading bar over a block, the rough
 * geometry of a widget body. Pass `skeleton` for one shaped like the result.
 */
function DefaultSkeleton() {
  return (
    <>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-24 w-full" />
    </>
  )
}

/**
 * A loading state for screen readers and eyes alike: a polite status with
 * the (visually hidden) text, and the skeleton shown instead of it.
 */
export function LoadingStatus({
  text,
  skeleton,
  className,
}: {
  text: string
  skeleton?: ReactNode
  className?: string
}) {
  return (
    <div role="status" className={cn("flex flex-col gap-3", className)}>
      <span className="sr-only">{text}</span>
      <div aria-hidden="true" className="flex flex-col gap-3">
        {skeleton ?? <DefaultSkeleton />}
      </div>
    </div>
  )
}

/**
 * The canonical loading / error / no-data boundary for widgets driven by
 * `useViewData`-style hooks — the block every widget used to copy inline.
 *
 * - Loading: the `skeleton` (default: a heading bar and a block) under a
 *   polite status whose words ("Ansicht wird geladen…" / "Loading view…",
 *   or `loadingText`) only a screen reader reads.
 * - Error: the toolkit's `ErrorState` from {@link describeError}: what
 *   happened, what you can do, the raw text collapsed under "Details", and a
 *   retry — mandatory, a failed load is never a dead end.
 * - No data: the toolkit's `EmptyState` with `emptyText`.
 *
 * Callers keep their own wrapper (`WidgetShell`, card, …):
 *
 *   if (!data) {
 *     return (
 *       <WidgetShell>
 *         <ViewDataState loading={loading} error={error} onRetry={refetch}
 *           emptyText={t("x.noData")} />
 *       </WidgetShell>
 *     )
 *   }
 */
export function ViewDataState({
  loading,
  error,
  onRetry,
  emptyText,
  loadingText,
  skeleton,
  errorTitle,
  retryLabel,
  className,
}: {
  loading: boolean
  error: Error | null | undefined
  /** Re-run the failed load (the query's refetch). */
  onRetry: () => void
  /** What is missing when the load finished without data ("No incident found"). */
  emptyText: string
  /** The loading status for screen readers (default: the active locale's "Loading view…"). */
  loadingText?: string
  /** Shown while loading, shaped like the result (default: a heading bar and a block). */
  skeleton?: ReactNode
  /** Title for an error the kit cannot classify (default: the locale's "Something went wrong"). */
  errorTitle?: string
  /** Caller-localized retry label (default: the active locale's). */
  retryLabel?: string
  /** Merged into the state's wrapper (tailwind-merge semantics). */
  className?: string
}) {
  const locale = useLocale()
  const defaults = kitLabels(locale)
  if (error) {
    const described = describeError(error, locale, { fallbackTitle: errorTitle })
    return (
      <ErrorState
        className={className}
        title={described.title}
        description={described.hint}
        details={described.details ?? undefined}
        onRetry={onRetry}
        retryLabel={retryLabel}
      />
    )
  }
  if (loading) {
    return (
      <LoadingStatus
        text={loadingText ?? defaults.loadingView}
        skeleton={skeleton}
        className={className}
      />
    )
  }
  return <EmptyState className={className} title={emptyText} />
}
