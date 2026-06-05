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
import { TONE_TEXT } from "@miragon-ai/widget-shell/widgets"

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
 * Map a signed delta string to a tone className.
 *
 * Returns `text-critical` when the change is bad, `text-m-green` when it is
 * good, and `undefined` when the delta is neutral / missing (em-dash) so the
 * cell inherits the default foreground color.
 */
export function colorFor(value: string, worseIfUp: boolean): string | undefined {
  if (value === "—") return undefined
  const positive = value.startsWith("+")
  const negative = value.startsWith("-")
  if (!positive && !negative) return undefined
  const bad = worseIfUp ? positive : negative
  return bad ? TONE_TEXT.critical : TONE_TEXT.success
}

/** A single metric row: a label plus the two compared values. */
export type ComparisonMetric = {
  label: string
  delta: { value: string; worseIfUp: boolean }
  before: string
  after: string
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
 * Callers resolve their own KPI buckets and pass in the already-formatted
 * metric rows plus the heading, badges, and the two comparison column labels.
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
              <TableHead scope="col">Metric</TableHead>
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
                <TableCell className={colorFor(m.delta.value, m.delta.worseIfUp)}>
                  {m.delta.value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
