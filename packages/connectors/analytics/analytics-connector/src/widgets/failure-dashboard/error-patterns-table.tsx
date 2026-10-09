import {
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
  CountPill,
  Section,
  TableEmptyState,
  TableSkeleton,
  WidgetShell,
} from "@miragon-ai/widget-shell/widgets"
import type { ErrorPatternItem, FailureDashboardData } from "@miragon-ai/analytics-client"
import { useFailureDashboardSelfFetch, type FailureScopeProps } from "./lib.js"
import { QueryGate } from "../query-gate.js"
import { useT } from "../../messages/use-t.js"
import { engineIdsOf, useHandOff, type HandOff } from "../hand-off.js"

/**
 * Root cause of ONE group of open incidents. The open-incident gauge carries
 * only the incident type and the process (#336) — the message and the
 * failing activity come from the live incidents, so the hand-off passes no
 * field the data cannot fill. A custom incident type is any string: unless
 * id-shaped it is quoted as untrusted data, never inlined.
 */
export function errorPatternHandOff(
  pattern: ErrorPatternItem,
  data: Pick<FailureDashboardData, "engines">,
): HandOff {
  return {
    intent: "askAi.errorPattern",
    ids: {
      engine: engineIdsOf(data.engines),
      processDefinitionKey: pattern.processDefinitionKey,
      incidentType: pattern.incidentType,
    },
    facts: { openIncidentsNow: pattern.incidentCount },
    tools: [
      "analytics_find_failed_instances",
      "camunda7_list_incidents",
      "camunda7_query_historic_incidents",
      "camunda7_query_historic_activity_instances",
    ],
  }
}

export function ErrorPatternsTable({
  data: initialData,
  engine,
}: { data: FailureDashboardData | null } & FailureScopeProps) {
  const t = useT()
  const { ask } = useHandOff()
  const fallbackQuery = useFailureDashboardSelfFetch(initialData, { engine })
  return (
    <QueryGate initialData={initialData} query={fallbackQuery} skeleton={<TableSkeleton />}>
      {(data) => {
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
          return (
            <WidgetShell>
              <TableEmptyState>{t("aErrorPatterns.emptyNoPatterns")}</TableEmptyState>
            </WidgetShell>
          )
        }

        return (
          <WidgetShell>
            <Section
              title={t("aErrorPatterns.heading")}
              count={data.errorPatterns.length}
              defaultOpen
            >
              <div className="rounded-lg border">
                <Table aria-label={t("aErrorPatterns.tableAriaLabel")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{t("aErrorPatterns.columnIncidentType")}</TableHead>
                      <TableHead scope="col">{t("aErrorPatterns.columnProcess")}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {t("aErrorPatterns.columnCount")}
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        <span className="sr-only">{t("aErrorPatterns.columnAi")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.errorPatterns.map((pattern) => (
                      <TableRow key={`${pattern.processDefinitionKey}:${pattern.incidentType}`}>
                        <TableCell className="font-mono text-sm">{pattern.incidentType}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {pattern.processDefinitionKey}
                        </TableCell>
                        <TableCell className="text-right">
                          <CountPill tone="critical">{pattern.incidentCount}</CountPill>
                        </TableCell>
                        <TableCell className="text-right">
                          <AskAiButton
                            variant="icon"
                            title={t("aErrorPatterns.analyzeLabel")}
                            label={t("aErrorPatterns.analyzeLabel")}
                            prompt={ask(errorPatternHandOff(pattern, data))}
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
      }}
    </QueryGate>
  )
}
