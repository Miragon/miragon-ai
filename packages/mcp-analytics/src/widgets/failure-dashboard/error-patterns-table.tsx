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
} from "@miragon/mcp-toolkit-ui"
import type { FailureDashboardData } from "@miragon-ai/client-analytics"
import { formatDate, truncate, useFailureDashboardSelfFetch } from "./lib.js"

export function ErrorPatternsTable({ data: initialData }: { data: FailureDashboardData | null }) {
  const fallbackQuery = useFailureDashboardSelfFetch(initialData)
  const data = initialData ?? fallbackQuery.data ?? null
  if (!data) return null
  if (data.errorPatterns.length === 0) {
    if (data.processBreakdown.length === 0) {
      return (
        <div className="bg-card text-card-foreground p-6">
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No open incidents found</p>
            </CardContent>
          </Card>
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-card text-card-foreground p-6">
      <details open>
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <svg
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Error</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Process</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead>First Seen</TableHead>
                <TableHead>Last Seen</TableHead>
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
    </div>
  )
}
