import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"

/**
 * The canonical loading / error / no-data boundary for widgets driven by
 * `useViewData`-style hooks. Renders a destructive alert for errors, otherwise
 * the (caller-localized) loading or empty text — the block every widget used
 * to copy inline. Callers keep their own wrapper (`WidgetShell`, card, …):
 *
 *   if (!data) {
 *     return (
 *       <WidgetShell>
 *         <ViewDataState loading={loading} error={error}
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
  className = "text-muted-foreground p-2 text-sm",
}: {
  loading: boolean
  error: Error | null | undefined
  loadingText: string
  emptyText: string
  className?: string
}) {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    )
  }
  return <div className={className}>{loading ? loadingText : emptyText}</div>
}
