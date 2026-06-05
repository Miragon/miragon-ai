import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import {
  CountPill,
  DrillButton,
  SectionHeading,
  TONE_DOT,
  WidgetShell,
} from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData } from "@miragon-ai/client-cibseven"
import { buildRows, type DefinitionRow } from "./lib.js"
import { useNav } from "../navigation.js"
import { CAMUNDA7_COCKPIT_OVERVIEW_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"

function ProcessRow({
  row,
  onOpen,
  onViewInstances,
}: {
  row: DefinitionRow
  onOpen: (processDefinitionKey: string) => void
  onViewInstances: (processDefinitionKey: string) => void
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
      <td className="border-border border-b px-4 py-3 align-middle">
        <div className="flex items-center justify-end gap-1.5">
          <DrillButton
            onClick={() => onViewInstances(row.key)}
            ariaLabel={`View running instances of ${row.name ?? row.key}`}
          >
            Instances
          </DrillButton>
          <DrillButton
            onClick={() => onOpen(row.key)}
            ariaLabel={`Open process detail for ${row.name ?? row.key}`}
          >
            Open
          </DrillButton>
        </div>
      </td>
    </tr>
  )
}

/** Shell-less process-definitions table. Reused standalone and in the cockpit app. */
export function ProcessDefinitionsTableView({
  data: initialData = null,
  engine,
}: {
  data?: CockpitDashboardData | null
  engine?: string
}) {
  const go = useNav()
  // Shares the health KPI's query key → deduped to a single fetch (see
  // health-kpi.tsx). Self-fetches in the cockpit; uses props standalone.
  const { data, loading, error } = useViewData<CockpitDashboardData>(
    initialData,
    ["camunda7:cockpit-overview", engine ?? null],
    CAMUNDA7_COCKPIT_OVERVIEW_DATA,
    { engine },
    !!engine,
  )

  if (!data) {
    if (error) {
      return (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )
    }
    return (
      <div className="text-muted-foreground p-2 text-sm">
        {loading ? "Loading…" : "No data available"}
      </div>
    )
  }

  const rows = buildRows(data)

  return (
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
              <ProcessRow
                key={row.id}
                row={row}
                onOpen={(k) => go({ type: "process-detail", processDefinitionKey: k })}
                onViewInstances={(k) => go({ type: "process-instances", processDefinitionKey: k })}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function ProcessDefinitionsTable({
  data,
  engine,
}: {
  data: CockpitDashboardData | null
  engine?: string
}) {
  return (
    <WidgetShell>
      <ProcessDefinitionsTableView data={data} engine={engine} />
    </WidgetShell>
  )
}
