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
import type { VersionCompareResult } from "@miragon-ai/client-analytics"

export type VersionCompareData = VersionCompareResult | null

const METRICS: Array<{
  label: string
  value: (k: VersionCompareResult["kpis"][number]) => string
  delta: (d: VersionCompareResult["delta"]) => { value: string; worseIfUp: boolean }
}> = [
  {
    label: "Instances",
    value: (k) => String(k.instance_count),
    delta: (d) => ({ value: fmtPct(d.instance_count_delta_pct), worseIfUp: false }),
  },
  {
    label: "Failure rate",
    value: (k) => `${k.failure_rate_pct.toFixed(1)}%`,
    delta: (d) => ({ value: fmtPp(d.failure_rate_delta_pp), worseIfUp: true }),
  },
  {
    label: "Incident rate",
    value: (k) => `${k.incident_rate_pct.toFixed(1)}%`,
    delta: (d) => ({ value: fmtPp(d.incident_rate_delta_pp), worseIfUp: true }),
  },
  {
    label: "Avg duration",
    value: (k) => `${k.avg_duration_sec.toFixed(1)}s`,
    delta: (d) => ({ value: fmtPct(d.avg_duration_delta_pct), worseIfUp: true }),
  },
  {
    label: "P95 duration",
    value: (k) => `${k.p95_duration_sec.toFixed(1)}s`,
    delta: (d) => ({ value: fmtPct(d.p95_duration_delta_pct), worseIfUp: true }),
  },
]

export function VersionCompareWidget({ data }: { data: VersionCompareData }) {
  if (!data)
    return (
      <Alert>
        <AlertDescription>No version-comparison data.</AlertDescription>
      </Alert>
    )

  const a = data.kpis.find((k) => k.bucket === "versionA")
  const b = data.kpis.find((k) => k.bucket === "versionB")
  if (!a || !b) {
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
          <strong>Version comparison</strong>
          <Badge>{data.processDefinitionKey}</Badge>
          <Badge variant="secondary">
            v{data.versionA} ↔ v{data.versionB}
          </Badge>
          <Badge variant="outline">window: {data.windowDays}d</Badge>
          {data.elementId && <Badge variant="outline">element: {data.elementId}</Badge>}
          {data.suppressed && (
            <Badge variant="destructive">
              Insufficient signal (min {data.minBucketSize} instances/version)
            </Badge>
          )}
        </div>

        <Table style={{ marginTop: 16 }}>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>v{data.versionA}</TableHead>
              <TableHead>v{data.versionB}</TableHead>
              <TableHead>Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {METRICS.map((m) => {
              const d = m.delta(data.delta)
              return (
                <TableRow key={m.label}>
                  <TableCell>{m.label}</TableCell>
                  <TableCell>{m.value(a)}</TableCell>
                  <TableCell>{m.value(b)}</TableCell>
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
