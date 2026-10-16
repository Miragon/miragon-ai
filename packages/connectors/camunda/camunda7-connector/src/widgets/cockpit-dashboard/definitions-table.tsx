import { useId, useState } from "react"
import { ViewDataState, WidgetShell, formatNumber } from "@miragon/pulse-widget-shell/widgets"
import { FilterBar, ListFooter, useDebouncedValue, DrillButton } from "@miragon/mcp-toolkit-ui"
import { useViewData } from "@miragon/mcp-toolkit-ui/hooks"
import type { CockpitDashboardData } from "../../view-models.js"
import { buildRows } from "./lib.js"
import { useNav } from "../navigation.js"
import { CAMUNDA7_COCKPIT_OVERVIEW_DATA } from "../../tool-names.js"
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
  const headingId = useId()
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
  // health-kpi.tsx). Self-fetches in the cockpit; standalone the handed-in
  // overview seeds the query, scoped to its own engine.
  const feedEngine = engine ?? initialData?.engineId
  const { data, loading, error, refetch } = useViewData<CockpitDashboardData>(
    initialData,
    ["camunda7:cockpit-overview", feedEngine ?? null],
    CAMUNDA7_COCKPIT_OVERVIEW_DATA,
    { engine: feedEngine },
    !!feedEngine,
    { initialDataMode: "seed" },
  )

  if (!data) {
    return (
      <ViewDataState
        loading={loading}
        error={error}
        onRetry={refetch}
        loadingText={t("cockpitDefs.loading")}
        emptyText={t("cockpitDefs.noData")}
      />
    )
  }

  const allRows: ProcessDefinitionsTableRow[] = buildRows(data).map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    version: row.latestVersion,
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
    // A section of the overview like the failure clusters above it: the same
    // heading step, a real heading (#322 U27), its scope a quiet note beside.
    <section aria-labelledby={headingId}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={headingId} className="text-section text-foreground">
          {t("cockpitDefs.heading")}
        </h2>
        <span className="text-muted-foreground text-small">
          {t("cockpitDefs.deployedHint", { count: formatNumber(allRows.length) })}
        </span>
      </div>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("cockpitDefs.searchPlaceholder")}
        searchAriaLabel={t("cockpitDefs.searchLabel")}
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
              onDrill={() =>
                go({
                  type: "process-detail",
                  processDefinitionKey: row.key,
                  label: row.name ?? undefined,
                })
              }
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
