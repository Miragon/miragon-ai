import {
  Card,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
  Skeleton,
} from "@miragon/mcp-toolkit-ui"
import {
  QueryFallback,
  Section,
  TONE_TEXT,
  WidgetShell,
  formatDuration,
} from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData } from "@miragon-ai/client-analytics"
import { useDashboardSelfFetch, type AnalyticsDashboardPeriod } from "./lib.js"
import { useT } from "../../messages/use-t.js"

export function ProcessDefinitionBreakdown({
  data: initialData,
  processDefinitionKey,
  period,
}: {
  data: AnalyticsDashboardData | null
  processDefinitionKey?: string
  period?: AnalyticsDashboardPeriod
}) {
  const t = useT()
  const fallbackQuery = useDashboardSelfFetch(initialData, { processDefinitionKey, period })
  const data = initialData ?? fallbackQuery.data ?? null

  if (!data) {
    return (
      <WidgetShell>
        <QueryFallback
          isError={fallbackQuery.isError}
          error={fallbackQuery.error}
          errorTitle={t("aCommon.loadError")}
          skeleton={
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          }
        />
      </WidgetShell>
    )
  }

  if (data.definitionBreakdown.length === 0) {
    return (
      <WidgetShell>
        <Alert>
          <AlertDescription>{t("aDefBreakdown.emptyState")}</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell>
      <Section
        title={t("aDefBreakdown.heading")}
        count={data.definitionBreakdown.length}
        defaultOpen
      >
        <div className="flex flex-col gap-2">
          {data.definitionBreakdown.map((def) => (
            <Card key={def.processDefinitionKey} className="gap-0 py-0 shadow-none">
              <CardContent className="flex items-center justify-between p-3">
                <span className="font-mono text-sm font-medium">{def.processDefinitionKey}</span>
                <div className="text-muted-foreground flex items-center gap-4 text-sm">
                  <span>{t("aDefBreakdown.totalInstances", { count: def.totalInstances })}</span>
                  <span className={TONE_TEXT.success}>
                    {t("aDefBreakdown.completedCount", { count: def.completed })}
                  </span>
                  <span className={TONE_TEXT.info}>
                    {t("aDefBreakdown.runningCount", { count: def.running })}
                  </span>
                  {def.failed > 0 && (
                    <Badge variant="destructive">
                      {t("aDefBreakdown.failedCount", { count: def.failed })}
                    </Badge>
                  )}
                  <span>
                    {t("aDefBreakdown.avgDuration", {
                      duration: formatDuration(def.avgDurationMs),
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>
    </WidgetShell>
  )
}
