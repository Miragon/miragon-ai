import {
  Card,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
  Skeleton,
} from "@miragon/mcp-toolkit-ui"
import { TONE_TEXT, WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"
import { formatDuration, useDashboardSelfFetch, type AnalyticsDashboardPeriod } from "./lib.js"

export function ProcessDefinitionBreakdown({
  data: initialData,
  processDefinitionKey,
  period,
}: {
  data: AnalyticsDashboardData | null
  processDefinitionKey?: string
  period?: AnalyticsDashboardPeriod
}) {
  const fallbackQuery = useDashboardSelfFetch(initialData, { processDefinitionKey, period })
  const data = initialData ?? fallbackQuery.data ?? null

  if (!data) {
    return (
      <WidgetShell>
        {fallbackQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{fallbackQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        )}
      </WidgetShell>
    )
  }

  if (data.definitionBreakdown.length === 0) {
    return (
      <WidgetShell>
        <Alert>
          <AlertDescription>No process definitions in the selected window.</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell>
      <details open>
        <summary className="focus-visible:ring-ring flex cursor-pointer list-none items-center gap-2 rounded outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
          <svg
            className="text-muted-foreground size-4 shrink-0 transition-transform [[open]>&]:rotate-90"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
          </svg>
          <h3 className="text-lg font-medium">By Process Definition</h3>
          <Badge variant="secondary">{data.definitionBreakdown.length}</Badge>
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          {data.definitionBreakdown.map((def) => (
            <Card key={def.processDefinitionKey} className="gap-0 py-0 shadow-none">
              <CardContent className="flex items-center justify-between p-3">
                <span className="font-mono text-sm font-medium">{def.processDefinitionKey}</span>
                <div className="text-muted-foreground flex items-center gap-4 text-sm">
                  <span>{def.totalInstances} total</span>
                  <span className={TONE_TEXT.success}>{def.completed} completed</span>
                  <span className={TONE_TEXT.info}>{def.running} running</span>
                  {def.failed > 0 && <Badge variant="destructive">{def.failed} failed</Badge>}
                  <span>avg {formatDuration(def.avgDurationMs)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </details>
    </WidgetShell>
  )
}
