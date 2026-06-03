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
  Skeleton,
} from "@miragon/mcp-toolkit-ui"
import { WidgetShell } from "@miragon-ai/widget-shell/widgets"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"
import { formatDate, truncate, useFailureDashboardSelfFetch } from "./lib.js"

export function ErrorPatternsTable({ data: initialData }: { data: FailureDashboardData | null }) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData)
  const data = initialData ?? fallbackQuery.data ?? null
  if (!data) {
    return (
      <WidgetShell>
        <div className="rounded-lg border p-4" aria-busy="true">
          <Skeleton className="mb-3 h-5 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
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
                <AlertTitle>No open incidents found</AlertTitle>
                <AlertDescription>
                  There are no error patterns or failing processes in the current snapshot.
                </AlertDescription>
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
          <h3 className="text-lg font-medium">Error Patterns</h3>
          <Badge variant="destructive">{data.errorPatterns.length}</Badge>
        </summary>
        <div className="mt-3 rounded-lg border">
          <Table aria-label="Error patterns by incident message, activity and process">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" aria-sort="none">
                  Error
                </TableHead>
                <TableHead scope="col" aria-sort="none">
                  Activity
                </TableHead>
                <TableHead scope="col" aria-sort="none">
                  Process
                </TableHead>
                <TableHead scope="col" aria-sort="none" className="text-right">
                  Count
                </TableHead>
                <TableHead scope="col" aria-sort="none">
                  First Seen
                </TableHead>
                <TableHead scope="col" aria-sort="none">
                  Last Seen
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
                          Sample IDs:{" "}
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
                    {formatDate(pattern.firstOccurrence)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(pattern.lastOccurrence)}
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
