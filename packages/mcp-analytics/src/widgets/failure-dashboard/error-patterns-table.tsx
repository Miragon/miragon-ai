import {
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Card,
  CardContent,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  QueryFallback,
  Section,
  TableSkeleton,
  WidgetShell,
  formatTimestamp,
  truncate,
} from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"
import { useFailureDashboardSelfFetch } from "./lib.js"
import { useT } from "../../messages/use-t.js"

export function ErrorPatternsTable({ data: initialData }: { data: FailureDashboardData | null }) {
  const t = useT()
  const fallbackQuery = useFailureDashboardSelfFetch(initialData)
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
  if (data.errorPatterns.length === 0) {
    if (data.processBreakdown.length === 0) {
      return (
        <WidgetShell>
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="p-4">
              <Alert>
                <AlertTitle>{t("aErrorPatterns.emptyTitle")}</AlertTitle>
                <AlertDescription>{t("aErrorPatterns.emptyDescription")}</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </WidgetShell>
      )
    }
    return null
  }

  return (
    <WidgetShell>
      <Section
        title={t("aErrorPatterns.heading")}
        count={data.errorPatterns.length}
        badgeVariant="destructive"
        defaultOpen
      >
        <div className="rounded-lg border">
          <Table aria-label={t("aErrorPatterns.tableAriaLabel")}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" aria-sort="none">
                  {t("aErrorPatterns.columnError")}
                </TableHead>
                <TableHead scope="col" aria-sort="none">
                  {t("aErrorPatterns.columnActivity")}
                </TableHead>
                <TableHead scope="col" aria-sort="none">
                  {t("aErrorPatterns.columnProcess")}
                </TableHead>
                <TableHead scope="col" aria-sort="none" className="text-right">
                  {t("aErrorPatterns.columnCount")}
                </TableHead>
                <TableHead scope="col" aria-sort="none">
                  {t("aErrorPatterns.columnFirstSeen")}
                </TableHead>
                <TableHead scope="col" aria-sort="none">
                  {t("aErrorPatterns.columnLastSeen")}
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <span className="sr-only">{t("aErrorPatterns.columnAi")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.errorPatterns.map((pattern, i) => (
                <TableRow key={i}>
                  <TableCell className="max-w-xs">
                    <details>
                      <summary className="text-destructive cursor-pointer text-sm">
                        {truncate(pattern.incidentMessage, 60)}
                      </summary>
                      <pre className="bg-muted mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded p-2 text-xs">
                        {pattern.incidentMessage}
                      </pre>
                      {pattern.sampleInstanceIds.length > 0 && (
                        <div className="text-muted-foreground mt-1 text-xs">
                          {t("aErrorPatterns.sampleIdsLabel")}{" "}
                          {pattern.sampleInstanceIds.map((id) => id.slice(0, 8)).join(", ")}
                        </div>
                      )}
                    </details>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{pattern.activityId}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {pattern.processDefinitionKey}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="destructive">{pattern.incidentCount}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatTimestamp(pattern.firstOccurrence)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatTimestamp(pattern.lastOccurrence)}
                  </TableCell>
                  <TableCell className="text-right">
                    <AskAiButton
                      variant="icon"
                      title={t("aErrorPatterns.diagnoseTitle")}
                      label={t("aErrorPatterns.diagnoseLabel")}
                      prompt={`Root-cause this CIB Seven error pattern across the fleet on the current engine. The pattern is incident message "${pattern.incidentMessage}" at activity "${pattern.activityId || "(unknown activity)"}" in process definition "${pattern.processDefinitionKey}", with ${pattern.incidentCount} incident(s) first seen ${pattern.firstOccurrence} and last seen ${pattern.lastOccurrence}${pattern.sampleInstanceIds.length > 0 ? `, sample instance ids ${pattern.sampleInstanceIds.join(", ")}` : ""}. Pull the failing instances with analytics_find_failed_instances (filter by processDefinitionKey "${pattern.processDefinitionKey}") and the live incidents with camunda7_list_incidents, then inspect the failing activity history via camunda7_query_historic_activity_instances for activity "${pattern.activityId || pattern.processDefinitionKey}". Tell me the likely root cause, whether this is transient (e.g. a retryable/timing/external dependency blip) or systemic (a code/config/data defect), and the recommended fix. Explanation only — do not change anything.`}
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
