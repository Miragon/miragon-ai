import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import {
  CountPill,
  DrillButton,
  SectionHeading,
  TONE_DOT,
  WidgetShell,
} from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData } from "../../view-models.js"
import { buildRows, type DefinitionRow } from "./lib.js"
import { useNav } from "../navigation.js"
import { CAMUNDA7_COCKPIT_OVERVIEW_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"
import { useT } from "../../messages/use-t.js"

function ProcessRow({
  row,
  onOpen,
  onViewInstances,
}: {
  row: DefinitionRow
  onOpen: (processDefinitionKey: string) => void
  onViewInstances: (processDefinitionKey: string) => void
}) {
  const t = useT()
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
            onDrill={() => onViewInstances(row.key)}
            ariaLabel={t("cockpitDefs.viewInstancesAria", { name: row.name ?? row.key })}
          >
            {t("cockpitDefs.instancesAction")}
          </DrillButton>
          <DrillButton
            onDrill={() => onOpen(row.key)}
            ariaLabel={t("cockpitDefs.openDetailAria", { name: row.name ?? row.key })}
          >
            {t("cockpitDefs.openAction")}
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
  const t = useT()
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
        {loading ? t("cockpitDefs.loading") : t("cockpitDefs.noData")}
      </div>
    )
  }

  const rows = buildRows(data)

  return (
    <section>
      <SectionHeading
        title={t("cockpitDefs.heading")}
        hint={t("cockpitDefs.deployedHint", { count: rows.length })}
      />

      {rows.length === 0 ? (
        <div className="border-border text-muted-foreground bg-card rounded-lg border p-8 text-center text-sm">
          {t("cockpitDefs.emptyState")}
        </div>
      ) : (
        <table className="w-full border-collapse text-sm" aria-label={t("cockpitDefs.tableAria")}>
          <thead className="bg-muted">
            <tr>
              <th
                scope="col"
                className="border-border text-muted-foreground border-y px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide"
              >
                {t("cockpitDefs.colProcess")}
              </th>
              <th
                scope="col"
                className="border-border text-muted-foreground border-y px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide"
              >
                {t("cockpitDefs.colVersion")}
              </th>
              <th
                scope="col"
                className="border-border text-muted-foreground border-y px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide"
              >
                {t("cockpitDefs.colRunning")}
              </th>
              <th
                scope="col"
                className="border-border text-muted-foreground border-y px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide"
              >
                {t("cockpitDefs.colFailedJobs")}
              </th>
              <th
                scope="col"
                className="border-border text-muted-foreground border-y px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide"
              >
                {t("cockpitDefs.colIncidents")}
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
