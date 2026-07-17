import {
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  QueryFallback,
  Section,
  TableSkeleton,
  WidgetShell,
} from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"
import { useFailureDashboardSelfFetch } from "./lib.js"
import { useT } from "../../messages/use-t.js"

export function FailureRateTable({ data: initialData }: { data: FailureDashboardData | null }) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData)
  const t = useT()
  const data = initialData ?? fallbackQuery.data ?? null
  if (!data) {
    return (
      <WidgetShell>
        <QueryFallback
          isError={fallbackQuery.isError}
          error={fallbackQuery.error}
          errorTitle={t("aCommon.loadError")}
          skeleton={<TableSkeleton />}
        />
      </WidgetShell>
    )
  }
  if (data.processBreakdown.length === 0) return null
  return (
    <WidgetShell>
      <Section title={t("aFailureRate.heading")} count={data.processBreakdown.length} defaultOpen>
        <div className="rounded-lg border">
          <Table aria-label={t("aFailureRate.tableLabel")}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" aria-sort="none">
                  {t("aFailureRate.colProcess")}
                </TableHead>
                <TableHead scope="col" aria-sort="none" className="text-right">
                  {t("aFailureRate.colTotal")}
                </TableHead>
                <TableHead scope="col" aria-sort="none" className="text-right">
                  {t("aFailureRate.colFailed")}
                </TableHead>
                <TableHead scope="col" aria-sort="none" className="text-right">
                  {t("aFailureRate.colIncidents")}
                </TableHead>
                <TableHead scope="col" aria-sort="none">
                  {t("aFailureRate.colFailureRate")}
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <span className="sr-only">{t("aFailureRate.colAi")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.processBreakdown.map((proc) => (
                <TableRow key={proc.processDefinitionKey}>
                  <TableCell className="font-mono text-sm font-medium">
                    {proc.processDefinitionKey}
                  </TableCell>
                  <TableCell className="text-right">{proc.totalInstances}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="destructive">{proc.failedCount}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{proc.incidentCount}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="bg-muted h-2 w-24 overflow-hidden rounded-full">
                        <div
                          className="bg-destructive h-full rounded-full"
                          style={{ width: `${Math.min(100, proc.failureRatePct)}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {proc.failureRatePct}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <AskAiButton
                      variant="icon"
                      title={t("aFailureRate.askAiTitle")}
                      label={t("aFailureRate.askAiLabel")}
                      prompt={`Explain in plain language why process definition "${proc.processDefinitionKey}" on the current engine shows a ${proc.failureRatePct}% failure rate (${proc.failedCount} failed and ${proc.incidentCount} incident(s) out of ${proc.totalInstances} instances). Determine whether this is a regression by comparing recent versions with analytics_version_compare (processDefinitionKey "${proc.processDefinitionKey}") and recent time periods with analytics_compare_execution_periods (processDefinitionKey "${proc.processDefinitionKey}"), and identify the dominant failing activity with analytics_element_bottleneck (processDefinitionKey "${proc.processDefinitionKey}"). Summarize what is driving this failure rate. Explanation only — do not change anything.`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </WidgetShell>
  )
}
