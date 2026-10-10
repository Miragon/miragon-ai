import { Alert, AlertDescription, Button } from "@miragon/mcp-toolkit-ui"
import { cn } from "./cn.js"

/**
 * The canonical loading / error / no-data boundary for widgets driven by
 * `useViewData`-style hooks. Renders a destructive alert for errors, otherwise
 * the (caller-localized) loading or empty text — the block every widget used
 * to copy inline. With `onRetry` (the query's refetch) the error carries a
 * Retry, so a failed load is never a dead end. Callers keep their own wrapper
 * (`WidgetShell`, card, …):
 *
 *   if (!data) {
 *     return (
 *       <WidgetShell>
 *         <ViewDataState loading={loading} error={error} onRetry={refetch}
 *           loadingText={t("x.loading")} emptyText={t("x.noData")} />
 *       </WidgetShell>
 *     )
 *   }
 */
export function ViewDataState({
  loading,
  error,
  loadingText,
  emptyText,
  className,
  onRetry,
  retryLabel = "Try again",
}: {
  loading: boolean
  error: Error | null | undefined
  loadingText: string
  emptyText: string
  /** Merged into the default text styling (tailwind-merge semantics). */
  className?: string
  /** Re-run the failed load (the query's refetch) — renders a Retry button. */
  onRetry?: () => void
  /** Caller-localized Retry label. */
  retryLabel?: string
}) {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <span>{error.message}</span>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-2 w-fit" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <div className={cn("text-muted-foreground p-2 text-sm", className)}>
      {loading ? loadingText : emptyText}
    </div>
  )
}
