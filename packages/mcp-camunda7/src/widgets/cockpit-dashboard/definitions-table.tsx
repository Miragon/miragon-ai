import {
  DrillButton,
  SectionHeading,
  ViewDataState,
  WidgetShell,
} from "@miragon-ai/widget-shell/widgets"
import type { CockpitDashboardData } from "../../view-models.js"
import { buildRows } from "./lib.js"
import { useNav } from "../navigation.js"
import { CAMUNDA7_COCKPIT_OVERVIEW_DATA } from "../../tool-names.js"
import { useViewData } from "../use-view-data.js"
import { useT } from "../../messages/use-t.js"
import {
  ProcessDefinitionsTableView,
  type ProcessDefinitionsTableRow,
} from "../process-definitions-table-view.js"

/**
 * Shell-less cockpit definitions section. Reused standalone and in the cockpit
 * app. Thin adapter over the canonical {@link ProcessDefinitionsTableView}: it
 * contributes the per-definition operational counts plus the drill actions.
 */
export function ProcessDefinitionsSection({
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
    return (
      <ViewDataState
        loading={loading}
        error={error}
        loadingText={t("cockpitDefs.loading")}
        emptyText={t("cockpitDefs.noData")}
      />
    )
  }

  const rows: ProcessDefinitionsTableRow[] = buildRows(data).map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    version: row.version,
    tone: row.tone,
    counts: {
      instances: row.instances,
      failedJobs: row.failedJobs,
      totalIncidents: row.totalIncidents,
    },
  }))

  return (
    <section>
      <SectionHeading
        title={t("cockpitDefs.heading")}
        hint={t("cockpitDefs.deployedHint", { count: rows.length })}
      />
      <ProcessDefinitionsTableView
        rows={rows}
        ariaLabel={t("cockpitDefs.tableAria")}
        emptyText={t("cockpitDefs.emptyState")}
        renderActions={(row) => (
          <>
            <DrillButton
              onDrill={() => go({ type: "process-instances", processDefinitionKey: row.key })}
              ariaLabel={t("cockpitDefs.viewInstancesAria", { name: row.name ?? row.key })}
            >
              {t("cockpitDefs.instancesAction")}
            </DrillButton>
            <DrillButton
              onDrill={() => go({ type: "process-detail", processDefinitionKey: row.key })}
              ariaLabel={t("cockpitDefs.openDetailAria", { name: row.name ?? row.key })}
            >
              {t("cockpitDefs.openAction")}
            </DrillButton>
          </>
        )}
      />
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
      <ProcessDefinitionsSection data={data} engine={engine} />
    </WidgetShell>
  )
}
