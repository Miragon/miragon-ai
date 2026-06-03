import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import {
  CountPill,
  SectionHeading,
  TONE_DOT,
  WidgetShell,
  useHostActions,
  type HostActions,
} from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData } from "@miragon-ai/client-cibseven"
import { CAMUNDA7_SHOW_PROCESS_DETAIL } from "../../tool-names.js"
import { buildRows, type DefinitionRow } from "./lib.js"

function ProcessRow({
  row,
  onOpen,
}: {
  row: DefinitionRow
  onOpen: (processDefinitionKey: string) => void
}) {
  return (
    <tr className="hover:bg-muted transition-colors">
      <td className="border-border border-b px-4 py-3 align-middle">
        <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
          <span className={`size-1.5 rounded-full ${TONE_DOT[row.tone]}`} />
          <span className="truncate">{row.name ?? row.key}</span>
        </div>
        <div className="text-muted-foreground mt-0.5 font-mono text-xs">{row.key}</div>
      </td>
      <td className="border-border border-b px-4 py-3 align-middle">
        <span className="border-border bg-muted text-muted-foreground inline-block rounded border px-1.5 py-0.5 font-mono text-xs">
          v{row.version}
        </span>
      </td>
      <td className="border-border text-muted-foreground border-b px-4 py-3 text-right align-middle font-mono text-xs tabular-nums">
        {row.instances.toLocaleString()}
      </td>
      <td className="border-border border-b px-4 py-3 text-right align-middle">
        {row.failedJobs > 0 ? (
          <CountPill tone="warning">{row.failedJobs}</CountPill>
        ) : (
          <span className="text-muted-foreground font-mono text-xs">0</span>
        )}
      </td>
      <td className="border-border border-b px-4 py-3 text-right align-middle">
        <CountPill tone={row.totalIncidents > 0 ? "critical" : "success"}>
          {row.totalIncidents}
        </CountPill>
      </td>
      <td className="border-border border-b px-4 py-3 text-right align-middle">
        <button
          type="button"
          onClick={() => onOpen(row.key)}
          aria-label={`Open process detail for ${row.name ?? row.key}`}
          className="bg-m-blue-soft text-m-blue hover:bg-m-blue/10 focus-visible:ring-ring inline-flex items-center gap-1 rounded-md border border-transparent px-2.5 py-1 text-xs font-semibold outline-none focus-visible:ring-2"
        >
          Open <span aria-hidden>→</span>
        </button>
      </td>
    </tr>
  )
}

export function ProcessDefinitionsTable({ data }: { data: CockpitDashboardData | null }) {
  const host: HostActions = useHostActions()

  function openDetail(processDefinitionKey: string) {
    host.showWidget(
      `Show me the process detail for \`${processDefinitionKey}\` (use ${CAMUNDA7_SHOW_PROCESS_DETAIL})`,
    )
  }

  if (!data) {
    return (
      <WidgetShell>
        <Alert>
          <AlertDescription>No data available</AlertDescription>
        </Alert>
      </WidgetShell>
    )
  }

  const rows = buildRows(data)

  return (
    <WidgetShell>
      <section>
        <SectionHeading title="Alle Prozesse" hint={`${rows.length} deployed`} />

        {rows.length === 0 ? (
          <div className="border-border text-muted-foreground bg-card rounded-lg border p-8 text-center text-sm">
            No process definitions deployed
          </div>
        ) : (
          <table
            className="w-full border-collapse text-sm"
            aria-label="Deployed process definitions with running instances, failed jobs and incidents"
          >
            <thead className="bg-muted">
              <tr>
                <th
                  scope="col"
                  className="border-border text-muted-foreground border-y px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                >
                  Prozess
                </th>
                <th
                  scope="col"
                  className="border-border text-muted-foreground border-y px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                >
                  Version
                </th>
                <th
                  scope="col"
                  className="border-border text-muted-foreground border-y px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide"
                >
                  Running
                </th>
                <th
                  scope="col"
                  className="border-border text-muted-foreground border-y px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide"
                >
                  Failed jobs
                </th>
                <th
                  scope="col"
                  className="border-border text-muted-foreground border-y px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide"
                >
                  Incidents
                </th>
                <th scope="col" className="border-border border-y px-4 py-2.5" />
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
