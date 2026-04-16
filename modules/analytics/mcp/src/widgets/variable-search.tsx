import { useState } from "react"
import {
  Card,
  CardContent,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Alert,
  AlertDescription,
  Button,
  Input,
  useToolMutation,
} from "@miragon/mcp-toolkit-ui"
import type { VariableSearchData, VariableSearchRow } from "@miragon-ai/client-analytics"

export type { VariableSearchData }

function formatDuration(ms: number | null): string {
  if (ms == null) return "\u2014"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`
  return `${(ms / 3600000).toFixed(1)}h`
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

const STATE_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  ACTIVE: "default",
  COMPLETED: "secondary",
  INTERNALLY_TERMINATED: "destructive",
  EXTERNALLY_TERMINATED: "destructive",
}

export function VariableSearchWidget({ data: initialData }: { data: VariableSearchData | null }) {
  const [variableName, setVariableName] = useState(initialData?.searchParams?.variableName ?? "")
  const [variableValue, setVariableValue] = useState(initialData?.searchParams?.variableValue ?? "")
  const [processKey, setProcessKey] = useState(
    initialData?.searchParams?.processDefinitionKey ?? "",
  )
  const [results, setResults] = useState<VariableSearchRow[] | null>(initialData?.results ?? null)
  const searchMutation = useToolMutation("analytics_search_by_variable")

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!variableName.trim() || !variableValue.trim()) return

    searchMutation.mutate(
      {
        variableName: variableName.trim(),
        variableValue: variableValue.trim(),
        ...(processKey.trim() ? { processDefinitionKey: processKey.trim() } : {}),
        limit: 50,
      },
      {
        onSuccess: (result) => {
          setResults(result as VariableSearchRow[])
        },
      },
    )
  }

  return (
    <div className="bg-card text-card-foreground flex flex-col gap-6 p-6">
      <h2 className="text-xl font-semibold">Variable Search</h2>

      <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">Variable Name</label>
          <Input
            className="w-48"
            placeholder="e.g. orderId"
            value={variableName}
            onChange={(e) => setVariableName(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">Variable Value</label>
          <Input
            className="w-48"
            placeholder="e.g. ORD-12345"
            value={variableValue}
            onChange={(e) => setVariableValue(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">
            Process Key (optional)
          </label>
          <Input
            className="w-48"
            placeholder="e.g. invoice"
            value={processKey}
            onChange={(e) => setProcessKey(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={searchMutation.isPending}>
          {searchMutation.isPending ? "Searching\u2026" : "Search"}
        </Button>
      </form>

      {searchMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Search failed: {searchMutation.error?.message ?? "Unknown error"}
          </AlertDescription>
        </Alert>
      )}

      {results === null && !searchMutation.isPending && (
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              Enter a variable name and value to search for matching process instances
            </p>
          </CardContent>
        </Card>
      )}

      {results !== null && results.length === 0 && (
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No matching instances found</p>
          </CardContent>
        </Card>
      )}

      {results !== null && results.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{results.length} results</Badge>
            {results.length >= 50 && (
              <span className="text-muted-foreground text-xs">
                (limited to 50 — refine your search for more specific results)
              </span>
            )}
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instance ID</TableHead>
                  <TableHead>Process</TableHead>
                  <TableHead>Business Key</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => (
                  <TableRow key={row.process_instance_id}>
                    <TableCell className="font-mono text-xs">{row.process_instance_id}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {row.process_definition_key}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.business_key ?? "\u2014"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATE_VARIANTS[row.state] ?? "secondary"}>{row.state}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(row.start_time)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm tabular-nums">
                      {formatDuration(row.duration_in_millis)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-xs">
                      {row.text_value}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
