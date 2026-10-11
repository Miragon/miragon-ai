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
import { CircleAlert, TrendingDown, TrendingUp } from "lucide-react"
import {
  Icon,
  TONE_ICON,
  cn,
  formatDuration,
  formatNumber,
  formatPercent,
} from "@miragon-ai/widget-shell/widgets"
import type { CompareKpiDelta, CompareKpis } from "@miragon-ai/analytics-client"
import { useT, type T } from "../messages/use-t.js"

/**
 * The on-screen deltas as hand-off facts (#338) — null deltas (a zero
 * baseline) are left out, like the em-dash on screen, never sent as 0.
 */
export function deltaFacts(delta: CompareKpiDelta, suppressed: boolean) {
  return {
    // Starts compare PER DAY, so a clamped (shorter) window compares fairly.
    startedPerDayDeltaPct: delta.started_per_day_delta_pct,
    incidentRateDeltaPp: delta.incident_rate_delta_pp,
    // Non-null only when the comparison was scoped to an element.
    elementIncidentRateDeltaPp: delta.element_incident_rate_delta_pp,
    avgDurationDeltaPct: delta.avg_duration_delta_pct,
    p95DurationDeltaPct: delta.p95_duration_delta_pct,
    suppressed,
  }
}

/**
 * How a metric's change is judged (U6). Only a QUALITY metric earns a verdict,
 * and only from its own threshold on, so rounding jitter stays neutral:
 *
 *  - `volume` (starts): never better or worse. Fewer starts on a test engine,
 *    or traffic moving to a new version, is no regression.
 *  - `quality`: "worse" or "better" once the change reaches `minChange`, in
 *    the delta's own unit (percent for durations, incidents per 100 starts
 *    for the rates).
 */
export type DeltaRule =
  { kind: "volume" } | { kind: "quality"; worseIfUp: boolean; minChange: number }

/** A duration changes noticeably from 5 % on (relative). */
export const DURATION_MIN_CHANGE_PCT = 5
/** An incident rate changes noticeably from 1 incident per 100 starts on (absolute). */
export const RATE_MIN_CHANGE = 1

export type DeltaVerdict = "worse" | "better" | "notReliable"

/**
 * A delta as its cell shows it: one decimal, rounded half away from zero
 * like `Intl.NumberFormat`. The verdict judges this number, so the same
 * "+5 %" on screen is never neutral in one row and "schlechter" in another.
 */
function shownDelta(value: number): number {
  return Math.sign(value) * (Math.round(Math.abs(value) * 10) / 10)
}

/**
 * The verdict on one delta, or `undefined` for none: a missing (null) delta,
 * a volume, or a change below the metric's threshold. The threshold applies
 * to the delta as shown ({@link shownDelta}). In a suppressed comparison (a
 * side below `minBucketSize`) every quality delta is "not reliable": the
 * screen must not judge what the model is told is noise.
 */
export function deltaVerdict(
  value: number | null,
  rule: DeltaRule,
  suppressed: boolean,
): DeltaVerdict | undefined {
  if (value === null || rule.kind === "volume") return undefined
  if (suppressed) return "notReliable"
  const shown = shownDelta(value)
  if (Math.abs(shown) < rule.minChange) return undefined
  const bad = rule.worseIfUp ? shown > 0 : shown < 0
  return bad ? "worse" : "better"
}

/**
 * `pct`: a relative change in percent (starts per day, durations);
 * `rate`: an absolute change of incidents per 100 starts, the unit of the
 * values themselves.
 */
type DeltaUnit = "pct" | "rate"

/**
 * A signed delta in the view's locale ("+12,5 %", "−0,4"), or an em-dash when
 * null. It formats {@link shownDelta}, the number the verdict judges.
 */
export function formatDelta(value: number | null, unit: DeltaUnit): string {
  const shown = value === null ? null : shownDelta(value)
  if (unit === "pct") return formatPercent(shown, { signed: true })
  return formatNumber(shown, { signDisplay: "exceptZero", maximumFractionDigits: 1 })
}

/**
 * The compare KPIs the table reads. Every rate and duration is nullable — the
 * version compare cannot measure incidents per version (no version label on
 * the incident metric), a window in which nothing ended has no duration, one
 * in which nothing started no rate — and a null renders "not measured", never
 * "0,0" or "0 ms".
 */
type ComparableKpis = Pick<CompareKpis, "instance_count"> & {
  incident_rate_pct: number | null
  /** Non-null exactly when the comparison was scoped to an element. */
  element_incident_count: number | null
  element_incident_rate_pct: number | null
  avg_duration_sec: number | null
  p95_duration_sec: number | null
}

/** Incidents per 100 starts, one decimal: "6,6" / "6.6" (no %: a rate may pass 100). */
const rateValue = (n: number | null) =>
  n === null ? null : formatNumber(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const durationValue = (sec: number | null) => (sec === null ? null : formatDuration(sec * 1000))

/** A single metric row: label, the two compared values, and the RAW delta with its rule. */
export type ComparisonMetric = {
  label: string
  before: string
  after: string
  delta: { value: number | null; unit: DeltaUnit; rule: DeltaRule }
}

const VOLUME: DeltaRule = { kind: "volume" }
const RATE_UP_IS_WORSE: DeltaRule = {
  kind: "quality",
  worseIfUp: true,
  minChange: RATE_MIN_CHANGE,
}
const DURATION_UP_IS_WORSE: DeltaRule = {
  kind: "quality",
  worseIfUp: true,
  minChange: DURATION_MIN_CHANGE_PCT,
}

/**
 * The one metric table shared by the cluster / version / engine compare
 * widgets — same `CompareKpis`/`CompareKpiDelta` core, so the rows are
 * defined once. Deltas stay numeric here; formatting and the verdict happen
 * at render time in {@link ComparisonCard}.
 */
const COMPARE_METRICS: Array<{
  labelKey: string
  /** Formatted value, or null when the KPI is not measured for this comparison. */
  value: (k: ComparableKpis) => string | null
  delta: (d: CompareKpiDelta) => number | null
  unit: DeltaUnit
  rule: DeltaRule
  /** Shown only when the comparison was scoped to an element. */
  elementOnly?: boolean
}> = [
  {
    // The count per window; the delta compares starts PER DAY, so a clamped
    // (shorter) window still compares fairly. A volume: no verdict.
    labelKey: "aComparison.metricStarted",
    value: (k) => formatNumber(k.instance_count),
    delta: (d) => d.started_per_day_delta_pct,
    unit: "pct",
    rule: VOLUME,
  },
  {
    labelKey: "aComparison.metricIncidentRate",
    value: (k) => rateValue(k.incident_rate_pct),
    delta: (d) => d.incident_rate_delta_pp,
    unit: "rate",
    rule: RATE_UP_IS_WORSE,
  },
  {
    labelKey: "aComparison.metricElementIncidentRate",
    value: (k) => rateValue(k.element_incident_rate_pct),
    delta: (d) => d.element_incident_rate_delta_pp,
    unit: "rate",
    rule: RATE_UP_IS_WORSE,
    elementOnly: true,
  },
  {
    labelKey: "aComparison.metricAvgDuration",
    value: (k) => durationValue(k.avg_duration_sec),
    delta: (d) => d.avg_duration_delta_pct,
    unit: "pct",
    rule: DURATION_UP_IS_WORSE,
  },
  {
    labelKey: "aComparison.metricP95Duration",
    value: (k) => durationValue(k.p95_duration_sec),
    delta: (d) => d.p95_duration_delta_pct,
    unit: "pct",
    rule: DURATION_UP_IS_WORSE,
  },
]

/** Resolve the shared metric rows for one baseline/other KPI pair. */
export function buildComparisonMetrics(
  t: T,
  before: ComparableKpis,
  after: ComparableKpis,
  delta: CompareKpiDelta,
): ComparisonMetric[] {
  const unavailable = t("aComparison.valueUnavailable")
  const elementScoped =
    before.element_incident_count !== null || after.element_incident_count !== null
  return COMPARE_METRICS.filter((m) => !m.elementOnly || elementScoped).map((m) => ({
    label: t(m.labelKey),
    before: m.value(before) ?? unavailable,
    after: m.value(after) ?? unavailable,
    delta: { value: m.delta(delta), unit: m.unit, rule: m.rule },
  }))
}

const VERDICT_KEY: Record<DeltaVerdict, string> = {
  worse: "aComparison.deltaWorse",
  better: "aComparison.deltaBetter",
  notReliable: "aComparison.deltaNotReliable",
}

/**
 * A single delta cell. The number stays neutral (CI: a state is an icon next
 * to black text, never a coloured digit); a verdict shows as a direction
 * icon in its tone plus the word ("schlechter", "besser"), so it never rests
 * on colour alone. A volume or a change below the threshold shows the signed
 * number only; a suppressed comparison mutes it with "nicht belastbar".
 */
function DeltaCell({
  delta,
  suppressed,
  t,
}: {
  delta: ComparisonMetric["delta"]
  suppressed: boolean
  t: T
}) {
  const verdict = deltaVerdict(delta.value, delta.rule, suppressed)
  const word = verdict ? t(VERDICT_KEY[verdict]) : undefined
  const judged = verdict === "worse" || verdict === "better"
  return (
    <TableCell data-verdict={verdict ?? "none"}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 tabular-nums",
          verdict === "notReliable" && "text-muted-foreground",
        )}
      >
        {judged && (
          <Icon
            icon={(delta.value ?? 0) > 0 ? TrendingUp : TrendingDown}
            dense
            className={TONE_ICON[verdict === "worse" ? "danger" : "success"]}
          />
        )}
        {formatDelta(delta.value, delta.unit)}
        {word && <span className="text-muted-foreground text-xs">{word}</span>}
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
 * The "too little data" chip of a suppressed comparison: a data-quality note,
 * not an error, so it stays neutral (outline + icon) like the deltas it
 * explains. A plain outline chip, not the toolkit `Badge`: that one forces
 * its icons to 12 px, and the icon keeps the kit's 16 px like every other
 * icon in the view (CI §11, `scanIconSizes`).
 */
export function SuppressedBadge({ children }: { children: ReactNode }) {
  return (
    <span
      className="text-foreground inline-flex w-fit shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      data-suppressed=""
    >
      <Icon icon={CircleAlert} dense />
      {children}
    </span>
  )
}

/**
 * Shared comparison card used by the cluster / version / engine compare widgets.
 *
 * Callers resolve their own KPI buckets (`buildComparisonMetrics`) and pass in
 * the metric rows plus the heading, badges, the reference frame (`meta`, a
 * `ViewMeta`) and the two comparison column labels.
 */
export function ComparisonCard({
  title,
  badges,
  meta,
  beforeLabel,
  afterLabel,
  tableLabel,
  metrics,
  suppressed,
  actions,
  note,
}: {
  title: string
  badges: ReactNode
  /** The quiet line under the title: period, engines, as-of time. */
  meta?: ReactNode
  beforeLabel: ReactNode
  afterLabel: ReactNode
  tableLabel: string
  metrics: ComparisonMetric[]
  /** A side is below `minBucketSize`: every quality delta reads "not reliable". */
  suppressed: boolean
  /** Optional header action slot (e.g. an AI affordance), right-aligned. */
  actions?: ReactNode
  /** Optional caveat under the table, e.g. why a metric reads "not measured". */
  note?: ReactNode
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
        {meta && <div className="mt-1">{meta}</div>}

        <Table className="mt-4" aria-label={tableLabel}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("aComparison.metricColumnHeader")}</TableHead>
              <TableHead scope="col">{beforeLabel}</TableHead>
              <TableHead scope="col">{afterLabel}</TableHead>
              <TableHead scope="col">{t("aComparison.deltaColumnHeader")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.map((m) => (
              <TableRow key={m.label}>
                <TableCell>{m.label}</TableCell>
                <TableCell className="tabular-nums">{m.before}</TableCell>
                <TableCell className="tabular-nums">{m.after}</TableCell>
                <DeltaCell delta={m.delta} suppressed={suppressed} t={t} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {note && (
          <Alert className="mt-4">
            <AlertDescription>{note}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
