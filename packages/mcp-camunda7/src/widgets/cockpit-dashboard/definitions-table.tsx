import { useState } from "react"
import {
  DrillButton,
  FilterBar,
  ListFooter,
  SectionHeading,
  ViewDataState,
  WidgetShell,
  useDebouncedValue,
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

/** Rows rendered per "Load more" step. */
const PAGE_SIZE = 50

/**
 * Shell-less cockpit definitions section. Reused standalone and in the cockpit
 * app. Thin adapter over the canonical {@link ProcessDefinitionsTableView}: it
 * contributes the per-definition operational counts plus the drill actions.
 *
 * Search + paging are CLIENT-side over the full statistics payload —
 * deliberate: `/process-definition/statistics` is uncapped (the feed already
 * carries every definition), has no filter/offset params, and the issue-first
 * sort would be lost with engine-side name paging. The footer's total is the
 * full filtered set, so it stays honest.
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
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 300)
  const [limit, setLimit] = useState(PAGE_SIZE)
  // Render-phase reset: a changed search must not keep an expanded limit.
  const [prevSearch, setPrevSearch] = useState(debouncedSearch)
  if (debouncedSearch !== prevSearch) {
    setPrevSearch(debouncedSearch)
    setLimit(PAGE_SIZE)
  }
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

  const allRows: ProcessDefinitionsTableRow[] = buildRows(data).map((row) => ({
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
  const filtered = debouncedSearch
    ? allRows.filter(
        (row) =>
          (row.name ?? "").toLowerCase().includes(debouncedSearch) ||
          row.key.toLowerCase().includes(debouncedSearch),
      )
    : allRows
  const rows = filtered.slice(0, limit)

  return (
    <section>
      <SectionHeading
        title={t("cockpitDefs.heading")}
        hint={t("cockpitDefs.deployedHint", { count: allRows.length })}
      />
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("cockpitDefs.searchPlaceholder")}
        chips={[]}
        onChipToggle={() => undefined}
        className="mb-2"
      />
      <ProcessDefinitionsTableView
        rows={rows}
        ariaLabel={t("cockpitDefs.tableAria")}
        emptyText={debouncedSearch ? t("cockpitDefs.noMatch") : t("cockpitDefs.emptyState")}
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
      <ListFooter
        shown={rows.length}
        total={filtered.length}
        hasMore={rows.length < filtered.length}
        onLoadMore={() => setLimit((prev) => prev + PAGE_SIZE)}
        noun={t("cockpitDefs.footerNoun")}
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
