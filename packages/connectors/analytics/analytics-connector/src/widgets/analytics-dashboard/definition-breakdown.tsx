import {
  Card,
  CardContent,
  Badge,
  Alert,
  AlertDescription,
  Skeleton,
} from "@miragon/mcp-toolkit-ui"
import { Section, TONE_TEXT, WidgetShell, formatDuration } from "@miragon-ai/widget-shell/widgets"
import type { AnalyticsDashboardData } from "@miragon-ai/analytics-client"
import { useDashboardSelfFetch, type DashboardScopeProps } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT } from "../../messages/use-t.js"

export function ProcessDefinitionBreakdown({
  data: initialData,
  processDefinitionKey,
  period,
  engine,
}: { data: AnalyticsDashboardData | null } & DashboardScopeProps) {
  const t = useT()
  const fallbackQuery = useDashboardSelfFetch(initialData, { processDefinitionKey, period, engine })

  return (
    <QueryGate
      initialData={initialData}
      query={fallbackQuery}
      skeleton={
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      }
    >
      {(data) =>
        data.definitionBreakdown.length === 0 ? (
          <WidgetShell>
            <Alert>
              <AlertDescription>{t("aDefBreakdown.emptyState")}</AlertDescription>
            </Alert>
          </WidgetShell>
        ) : (
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
                      <span className="font-mono text-sm font-medium">
                        {def.processDefinitionKey}
                      </span>
                      <div className="text-muted-foreground flex items-center gap-4 text-sm">
                        <span>
                          {t("aDefBreakdown.totalInstances", { count: def.totalInstances })}
                        </span>
                        <span className={TONE_TEXT.success}>
                          {t("aDefBreakdown.completedCount", { count: def.completed })}
                        </span>
                        {def.runningNow !== null && (
                          <span className={TONE_TEXT.info}>
                            {t("aDefBreakdown.runningNowCount", { count: def.runningNow })}
                          </span>
                        )}
                        {def.incidentsCreated > 0 && (
                          <Badge variant="destructive">
                            {t("aDefBreakdown.incidentsCreatedCount", {
                              count: def.incidentsCreated,
                            })}
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
    </QueryGate>
  )
}
