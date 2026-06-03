import {
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Skeleton,
} from "@miragon/mcp-toolkit-ui"
import { WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"
import { useFailureDashboardSelfFetch } from "./lib.js"

export function FailureRateTable({ data: initialData }: { data: FailureDashboardData | null }) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData)
  const data = initialData ?? fallbackQuery.data ?? null
  if (!data) {
    return (
      <WidgetShell>
        <div className="rounded-lg border p-4" aria-busy="true">
          <Skeleton className="mb-3 h-5 w-44" />
          <Skeleton className="h-32 w-full" />
        </div>
      </WidgetShell>
    )
  }
  if (data.processBreakdown.length === 0) return null
  return (
    <WidgetShell>
      <details open>
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <svg
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0 transition-transform [[open]>&]:rotate-90"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" />
          </svg>
          <h3 className="text-lg font-medium">Failures by Process</h3>
          <Badge variant="secondary">{data.processBreakdown.length}</Badge>
        </summary>
        <div className="mt-3 rounded-lg border">
          <Table aria-label="Failure rate by process definition">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" aria-sort="none">
                  Process
                </TableHead>
                <TableHead scope="col" aria-sort="none" className="text-right">
                  Total
                </TableHead>
                <TableHead scope="col" aria-sort="none" className="text-right">
                  Failed
                </TableHead>
                <TableHead scope="col" aria-sort="none" className="text-right">
                  Incidents
                </TableHead>
                <TableHead scope="col" aria-sort="none">
                  Failure Rate
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </WidgetShell>
  )
}
