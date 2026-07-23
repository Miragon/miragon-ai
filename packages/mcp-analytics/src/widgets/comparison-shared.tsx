import type { ReactNode } from "react"
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@miragon/mcp-toolkit-ui"
import { TONE_TEXT, formatDuration } from "@miragon-ai/widget-shell/widgets"
import type { CompareKpiDelta, CompareKpis } from "@miragon-ai/client-analytics"
import { useT, type T } from "../messages/use-t.js"

/** Format a percentage delta with an explicit sign, or an em-dash when null. */
export function fmtPct(n: number | null): string {
  if (n === null) return "—"
  const sign = n > 0 ? "+" : ""
  return `${sign}${n.toFixed(1)}%`
}

/** Format a percentage-point delta with an explicit sign, or an em-dash when null. */
export function fmtPp(n: number | null): string {
  if (n === null) return "—"
  const sign = n > 0 ? "+" : ""
  return `${sign}${n.toFixed(1)}pp`
}

/**
 * One-line, null-safe delta summary for the AskAi prompts — the same em-dash
 * treatment as the on-screen table, so a zero-baseline never reads "null%".
 */
export function describeDeltas(delta: CompareKpiDelta): string {
  return (
    `instances ${fmtPct(delta.instance_count_delta_pct)}, ` +
    `failure rate ${fmtPp(delta.failure_rate_delta_pp)}, ` +
    `incident rate ${fmtPp(delta.incident_rate_delta_pp)}, ` +
    `avg duration ${fmtPct(delta.avg_duration_delta_pct)}, ` +
    `p95 duration ${fmtPct(delta.p95_duration_delta_pct)}`
  )
}

/** Deltas inside this band read as unchanged (rounding jitter) — no tone. */
const NEUTRAL_BAND = 0.05

/**
 * Classify a delta as "worse"/"better" — the good/bad judgment behind the tone
 * color — or `undefined` for missing (null) / near-zero deltas. Surfaced to
 * assistive tech so the judgment isn't conveyed by color alone: the visible
 * `+/-` sign only carries direction, and the same "+5%" is bad for failure
 * rate but good for throughput.
 */
export function judgmentFor(
  value: number | null,
  worseIfUp: boolean,
): "worse" | "better" | undefined {
  if (value === null || Math.abs(value) < NEUTRAL_BAND) return undefined
  const bad = worseIfUp ? value > 0 : value < 0
  return bad ? "worse" : "better"
}

/**
 * Map a numeric delta to a tone className. Returns `text-critical` when the
 * change is bad, `text-m-green` when it is good, and `undefined` for missing
 * (null) or near-zero deltas so the cell inherits the default foreground.
 */
export function toneFor(value: number | null, worseIfUp: boolean): string | undefined {
  const judgment = judgmentFor(value, worseIfUp)
  return judgment === "worse"
    ? TONE_TEXT.critical
    : judgment === "better"
      ? TONE_TEXT.success
      : undefined
}

type DeltaUnit = "pct" | "pp"

/** A single metric row: label, the two compared values, and the RAW delta. */
export type ComparisonMetric = {
  label: string
  before: string
  after: string
  delta: { value: number | null; unit: DeltaUnit; worseIfUp: boolean }
}

/**
 * The one metric table shared by the cluster / version / engine compare
 * widgets — same `CompareKpis`/`CompareKpiDelta` core, so the rows are
 * defined once. Deltas stay numeric here; formatting and tone happen at
 * render time in {@link ComparisonCard}.
 */
const COMPARE_METRICS: Array<{
  labelKey: string
  value: (k: CompareKpis) => string
  delta: (d: CompareKpiDelta) => number | null
  unit: DeltaUnit
  worseIfUp: boolean
}> = [
  {
    labelKey: "aComparison.metricInstances",
    value: (k) => String(k.instance_count),
    delta: (d) => d.instance_count_delta_pct,
    unit: "pct",
    worseIfUp: false,
  },
  {
    labelKey: "aComparison.metricFailureRate",
    value: (k) => `${k.failure_rate_pct.toFixed(1)}%`,
    delta: (d) => d.failure_rate_delta_pp,
    unit: "pp",
    worseIfUp: true,
  },
  {
    labelKey: "aComparison.metricIncidentRate",
    value: (k) => `${k.incident_rate_pct.toFixed(1)}%`,
    delta: (d) => d.incident_rate_delta_pp,
    unit: "pp",
    worseIfUp: true,
  },
  {
    labelKey: "aComparison.metricAvgDuration",
    value: (k) => formatDuration(k.avg_duration_sec * 1000),
    delta: (d) => d.avg_duration_delta_pct,
    unit: "pct",
    worseIfUp: true,
  },
  {
    labelKey: "aComparison.metricP95Duration",
    value: (k) => formatDuration(k.p95_duration_sec * 1000),
    delta: (d) => d.p95_duration_delta_pct,
    unit: "pct",
    worseIfUp: true,
  },
]

/** Resolve the shared metric rows for one baseline/other KPI pair. */
export function buildComparisonMetrics(
  t: T,
  before: CompareKpis,
  after: CompareKpis,
  delta: CompareKpiDelta,
): ComparisonMetric[] {
  return COMPARE_METRICS.map((m) => ({
    label: t(m.labelKey),
    before: m.value(before),
    after: m.value(after),
    delta: { value: m.delta(delta), unit: m.unit, worseIfUp: m.worseIfUp },
  }))
}

/**
 * A single delta cell. The tone color carries the good/bad judgment for sighted
 * users; the same judgment is repeated as sr-only text (and a `title`) so it
 * isn't conveyed by color alone — see {@link judgmentFor}.
 */
function DeltaCell({ delta, t }: { delta: ComparisonMetric["delta"]; t: T }) {
  const judgment = judgmentFor(delta.value, delta.worseIfUp)
  const text = delta.unit === "pp" ? fmtPp(delta.value) : fmtPct(delta.value)
  const judgmentLabel = judgment
    ? judgment === "worse"
      ? t("aComparison.deltaWorse")
      : t("aComparison.deltaBetter")
    : undefined
  return (
    <TableCell className={toneFor(delta.value, delta.worseIfUp)}>
      <span title={judgmentLabel}>
        {text}
        {judgmentLabel && <span className="sr-only"> ({judgmentLabel})</span>}
      </span>
    </TableCell>
  )
}

/** Neutral "no data" / "incomplete" treatment — destructive is reserved for errors. */
export function ComparisonEmptyState({ children }: { children: ReactNode }) {
  return (
    <Alert>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

/**
 * Shared comparison card used by the cluster / version / engine compare widgets.
 *
 * Callers resolve their own KPI buckets (`buildComparisonMetrics`) and pass in
 * the metric rows plus the heading, badges, and the two comparison column labels.
 */
export function ComparisonCard({
  title,
  badges,
  beforeLabel,
  afterLabel,
  tableLabel,
  metrics,
  actions,
}: {
  title: string
  badges: ReactNode
  beforeLabel: ReactNode
  afterLabel: ReactNode
  tableLabel: string
  metrics: ComparisonMetric[]
  /** Optional header action slot (e.g. an AI affordance), right-aligned. */
  actions?: ReactNode
}) {
  const t = useT()
  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-foreground text-base font-semibold">{title}</h2>
          {badges}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>

        <Table className="mt-4" aria-label={tableLabel}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("aComparison.metricColumnHeader")}</TableHead>
              <TableHead scope="col">{beforeLabel}</TableHead>
              <TableHead scope="col">{afterLabel}</TableHead>
              <TableHead scope="col">Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.map((m) => (
              <TableRow key={m.label}>
                <TableCell>{m.label}</TableCell>
                <TableCell>{m.before}</TableCell>
                <TableCell>{m.after}</TableCell>
                <DeltaCell delta={m.delta} t={t} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
