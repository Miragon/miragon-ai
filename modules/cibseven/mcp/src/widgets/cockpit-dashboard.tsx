import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"

import {
  CountPill,
  KpiGrid,
  SectionHeading,
  WidgetHeader,
  WidgetShell,
  useHostActions,
  type HostActions,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"

import type { CockpitDashboardData, DefinitionStat } from "@miragon-ai/client-cibseven"

export type { CockpitDashboardData }

interface DefinitionRow extends DefinitionStat {
  totalIncidents: number
  tone: ToneVariant
}

function severityTone(failedJobs: number, totalIncidents: number): ToneVariant {
  if (totalIncidents > 0) return "critical"
  if (failedJobs > 0) return "warning"
  return "success"
}

function ProcessRow({
  row,
  onOpen,
}: {
  row: DefinitionRow
  onOpen: (processDefinitionKey: string) => void
}) {
  const dotClass =
    row.tone === "critical" ? "bg-critical" : row.tone === "warning" ? "bg-warning" : "bg-m-green"
  return (
    <tr className="hover:bg-bg cursor-pointer transition-colors" onClick={() => onOpen(row.key)}>
      <td className="border-line border-b px-4 py-3 align-middle">
        <div className="text-ink flex items-center gap-2 text-sm font-semibold">
          <span className={`size-1.5 rounded-full ${dotClass}`} />
          <span className="truncate">{row.name ?? row.key}</span>
        </div>
        <div className="text-ink-subtle mt-0.5 font-mono text-xs">{row.key}</div>
      </td>
      <td className="border-line border-b px-4 py-3 align-middle">
        <span className="border-line bg-bg text-ink-muted inline-block rounded border px-1.5 py-0.5 font-mono text-xs">
          v{row.version}
        </span>
      </td>
      <td className="border-line text-ink-muted border-b px-4 py-3 text-right align-middle font-mono text-xs tabular-nums">
        {row.instances.toLocaleString()}
      </td>
      <td className="border-line border-b px-4 py-3 text-right align-middle">
        {row.failedJobs > 0 ? (
          <CountPill tone="warning">{row.failedJobs}</CountPill>
        ) : (
          <span className="text-ink-subtle font-mono text-xs">0</span>
        )}
      </td>
      <td className="border-line border-b px-4 py-3 text-right align-middle">
        <CountPill tone={row.totalIncidents > 0 ? "critical" : "success"}>
          {row.totalIncidents}
        </CountPill>
      </td>
      <td className="border-line border-b px-4 py-3 text-right align-middle">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpen(row.key)
          }}
          className="bg-m-blue-soft text-m-blue hover:bg-m-blue/10 inline-flex items-center gap-1 rounded-md border border-transparent px-2.5 py-1 text-xs font-semibold"
        >
          Open <span aria-hidden>→</span>
        </button>
      </td>
    </tr>
  )
}

export function CockpitDashboardWidget({ data }: { data: CockpitDashboardData | null }) {
  const host: HostActions = useHostActions()

  function openDetail(processDefinitionKey: string) {
    host.showWidget(
      `Show me the process detail for \`${processDefinitionKey}\` (use camunda7_show_process_detail)`,
    )
  }

  if (!data) {
    return (
      <WidgetShell>
        <Alert variant="destructive">
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  const { summary, definitions } = data

  const rows: DefinitionRow[] = definitions.map((def) => {
    const totalIncidents = def.incidents.reduce((s, i) => s + i.incidentCount, 0)
    return {
      ...def,
      totalIncidents,
      tone: severityTone(def.failedJobs, totalIncidents),
    }
  })

  const healthyCount = rows.filter((r) => r.tone === "success").length
  const affectedCount = rows.length - healthyCount

  return (
    <WidgetShell>
      <WidgetHeader
        icon="▦"
        iconTone="info"
        title="Cockpit"
        sub={
          <span>
            Übersicht aller Prozesse · {summary.totalDefinitions}{" "}
            {summary.totalDefinitions === 1 ? "Prozess" : "Prozesse"}
          </span>
        }
      />

      <KpiGrid
        boxed
        header={{ label: "Health", badge: "Status der Prozesslandschaft" }}
        cells={[
          {
            label: "Prozesse gesamt",
            value: summary.totalDefinitions,
          },
          {
            label: "Healthy",
            value: healthyCount,
            fraction: ` /${summary.totalDefinitions}`,
            tone: healthyCount > 0 ? "success" : undefined,
          },
          {
            label: "Affected",
            value: affectedCount,
            fraction: ` /${summary.totalDefinitions}`,
            tone: affectedCount > 0 ? "critical" : undefined,
          },
          {
            label: "Open Incidents",
            value: summary.totalIncidents,
            tone: summary.totalIncidents > 0 ? "critical" : undefined,
          },
        ]}
      />

      <section>
        <SectionHeading title="Alle Prozesse" hint={`${rows.length} deployed`} />

        {rows.length === 0 ? (
          <div className="border-line text-ink-muted bg-card rounded-lg border p-8 text-center text-sm">
            No process definitions deployed
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-bg">
              <tr>
                <th className="border-line text-ink-subtle border-y px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">
                  Prozess
                </th>
                <th className="border-line text-ink-subtle border-y px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">
                  Version
                </th>
                <th className="border-line text-ink-subtle border-y px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">
                  Running
                </th>
                <th className="border-line text-ink-subtle border-y px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">
                  Failed jobs
                </th>
                <th className="border-line text-ink-subtle border-y px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide">
                  Incidents
                </th>
                <th className="border-line border-y px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ProcessRow key={row.id} row={row} onOpen={openDetail} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </WidgetShell>
  )
}
