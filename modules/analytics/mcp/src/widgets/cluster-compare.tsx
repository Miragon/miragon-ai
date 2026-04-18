import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@miragon/mcp-toolkit-ui"
import type { ClusterCompareResult } from "@miragon-ai/client-analytics"

export type ClusterCompareData = ClusterCompareResult | null

const METRICS: Array<{
  label: string
  before: (k: ClusterCompareResult["kpis"][number]) => string
  after: (k: ClusterCompareResult["kpis"][number]) => string
  delta: (d: ClusterCompareResult["delta"]) => { value: string; worseIfUp: boolean }
}> = [
  {
    label: "Instances",
    before: (k) => String(k.instance_count),
    after: (k) => String(k.instance_count),
    delta: (d) => ({ value: fmtPct(d.instance_count_delta_pct), worseIfUp: false }),
  },
  {
    label: "Failure rate",
    before: (k) => `${k.failure_rate_pct.toFixed(1)}%`,
    after: (k) => `${k.failure_rate_pct.toFixed(1)}%`,
    delta: (d) => ({ value: fmtPp(d.failure_rate_delta_pp), worseIfUp: true }),
  },
  {
    label: "Incident rate",
    before: (k) => `${k.incident_rate_pct.toFixed(1)}%`,
    after: (k) => `${k.incident_rate_pct.toFixed(1)}%`,
    delta: (d) => ({ value: fmtPp(d.incident_rate_delta_pp), worseIfUp: true }),
  },
  {
    label: "Avg duration",
    before: (k) => `${k.avg_duration_sec.toFixed(1)}s`,
    after: (k) => `${k.avg_duration_sec.toFixed(1)}s`,
    delta: (d) => ({ value: fmtPct(d.avg_duration_delta_pct), worseIfUp: true }),
  },
  {
    label: "P95 duration",
    before: (k) => `${k.p95_duration_sec.toFixed(1)}s`,
    after: (k) => `${k.p95_duration_sec.toFixed(1)}s`,
    delta: (d) => ({ value: fmtPct(d.p95_duration_delta_pct), worseIfUp: true }),
  },
]

export function ClusterCompareWidget({ data }: { data: ClusterCompareData }) {
  if (!data)
    return (
      <Alert>
        <AlertDescription>No comparison data.</AlertDescription>
      </Alert>
    )

  const before = data.kpis.find((k) => k.period === "before")
  const after = data.kpis.find((k) => k.period === "after")
  if (!before || !after) {
    return (
      <Alert>
        <AlertDescription>Incomplete KPI data.</AlertDescription>
      </Alert>
    )
  }

  return (
    <Card>
      <CardContent>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <strong>Pre/Post deployment</strong>
          <Badge variant="secondary">Deploy: {data.deploymentTimestamp}</Badge>
          <Badge variant="outline">
            -{data.windowDays.before}d / +{data.windowDays.after}d
          </Badge>
          {data.processDefinitionKey && <Badge>{data.processDefinitionKey}</Badge>}
          {data.elementId && <Badge variant="outline">element: {data.elementId}</Badge>}
          {data.suppressed && (
            <Badge variant="destructive">
              Insufficient signal (min {data.minBucketSize} instances/window)
            </Badge>
          )}
        </div>

        <Table style={{ marginTop: 16 }}>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>Before</TableHead>
              <TableHead>After</TableHead>
              <TableHead>Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {METRICS.map((m) => {
              const d = m.delta(data.delta)
              return (
                <TableRow key={m.label}>
                  <TableCell>{m.label}</TableCell>
                  <TableCell>{m.before(before)}</TableCell>
                  <TableCell>{m.after(after)}</TableCell>
                  <TableCell style={{ color: colorFor(d.value, d.worseIfUp) }}>{d.value}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function fmtPct(n: number | null): string {
  if (n === null) return "—"
  const sign = n > 0 ? "+" : ""
  return `${sign}${n.toFixed(1)}%`
}

function fmtPp(n: number | null): string {
  if (n === null) return "—"
  const sign = n > 0 ? "+" : ""
  return `${sign}${n.toFixed(1)}pp`
}

function colorFor(value: string, worseIfUp: boolean): string | undefined {
  if (value === "—") return undefined
  const positive = value.startsWith("+")
  const negative = value.startsWith("-")
  if (!positive && !negative) return undefined
  const bad = worseIfUp ? positive : negative
  return bad ? "#b91c1c" : "#15803d"
}
