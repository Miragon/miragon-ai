import { Badge } from "@miragon/mcp-toolkit-ui"
import {
  AskAiButton,
  FilterBar,
  QueryFallback,
  TableSkeleton,
  WidgetShell,
  usePagedListView,
} from "@miragon-ai/widget-shell/widgets"
import { useT } from "../messages/use-t.js"
import type { ProcessDefinition, ProcessListData } from "../view-models.js"
import { CAMUNDA7_PROCESS_LIST_DATA } from "../tool-names.js"
import { CockpitListFooter } from "./list-footer.js"
import {
  ProcessDefinitionsTableView,
  type ProcessDefinitionsTableRow,
} from "./process-definitions-table-view.js"

export type { ProcessListData }

const PAGE_SIZE = 50

export function ProcessListWidget({
  data: initialData,
  engine,
  processDefinitionKey,
  nameLike,
  latestVersion,
}: {
  data: ProcessListData | null
  /** Explicit engine routing (cockpit view); omitted → the payload's engine. */
  engine?: string
  /** Filter by exact process definition key. */
  processDefinitionKey?: string
  /** Filter by partial process definition name. */
  nameLike?: string
  /** Restrict to the latest version of each definition (default `true`). */
  latestVersion?: boolean
}) {
  const t = useT()
  // Standalone renders hand in only `data`, so the show tool's scope comes
  // from the payload's echo — a page-2 fetch without `latestVersion` would
  // mix all versions into a latest-only page 0.
  const echoed = initialData?.filters
  const feedEngine = engine ?? initialData?.engineId
  const effectiveKey = processDefinitionKey ?? echoed?.key
  const baseNameLike = nameLike ?? echoed?.nameLike
  const effectiveLatest = latestVersion ?? echoed?.latestVersion
  const args: Record<string, unknown> = {}
  if (feedEngine) args.engine = feedEngine
  if (effectiveKey) args.key = effectiveKey
  if (baseNameLike) args.nameLike = baseNameLike
  if (effectiveLatest !== undefined) args.latestVersion = effectiveLatest

  // The search is SERVER-side (nameLike on the paged feed, overriding a
  // handed-in prefilter) so it covers all deployed definitions.
  const { paged, search, setSearch, interacted } = usePagedListView<
    ProcessDefinition,
    ProcessListData
  >({
    initialData,
    key: [
      "camunda7:process-list",
      feedEngine ?? null,
      effectiveKey ?? null,
      baseNameLike ?? null,
      effectiveLatest ?? null,
    ],
    tool: CAMUNDA7_PROCESS_LIST_DATA,
    args,
    searchArg: "nameLike",
    pageSize: PAGE_SIZE,
    ready: true,
    selectItems: (d) => d.definitions,
    selectTotal: (d) => d.totalCount,
  })
  const data = paged.firstPage

  if (!data) {
    return (
      <WidgetShell>
        <QueryFallback
          isError={!!paged.error}
          error={paged.error}
          errorTitle={t("processList.loadError")}
          skeleton={<TableSkeleton />}
        />
      </WidgetShell>
    )
  }

  // Count-less adapter over the canonical definitions table: the count columns
  // and drill buttons are simply absent; a status column (active/suspended)
  // and the per-row Ask-AI handoff take their place.
  const rows: ProcessDefinitionsTableRow[] = paged.items.map((def) => ({
    id: def.id,
    key: def.key,
    name: def.name,
    version: def.version,
    tone: def.suspended ? "warning" : "success",
    versionTag: def.versionTag,
    suspended: def.suspended,
  }))

  return (
    <WidgetShell>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t("processList.heading")}</h2>
        <Badge variant="secondary">{t("processList.deployedCount", { count: paged.total })}</Badge>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("processList.searchPlaceholder")}
        chips={[]}
        onChipToggle={() => undefined}
      />

      <ProcessDefinitionsTableView
        rows={rows}
        ariaLabel={t("processList.tableAria")}
        emptyText={interacted ? t("processList.noMatch") : t("processList.emptyState")}
        status={{
          header: t("processList.colStatus"),
          render: (row) =>
            row.suspended ? (
              <Badge variant="secondary" className="bg-warning/10 text-warning-foreground">
                {t("processList.statusSuspended")}
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-success/10 text-success-foreground">
                {t("processList.statusActive")}
              </Badge>
            ),
        }}
        renderActions={(row) => (
          <AskAiButton
            variant="subtle"
            prompt={`Assess the operational health of process definition \`${row.key}\` (version v${row.version}${row.versionTag ? ", tag " + row.versionTag : ""}) on engine ${data.engineId}. First call analytics_analyze_process_performance with processDefinitionKey="${row.key}", period="7d", includeActivityBreakdown=true to get throughput, P50/P95 duration and the incident-based failure rate with a per-activity breakdown. Then call camunda7_list_incidents with processDefinitionId filtered to this definition (resolve the id from \`${row.key}\` v${row.version} via camunda7_list_process_definitions if needed) to see live open incidents. Summarise: is this definition healthy or degraded, which activities are the worst offenders, the dominant incident message(s), and the single most likely root cause. End with one concrete recommended next step (e.g. retry jobs, fix variable, redeploy). Do not mutate anything.`}
          />
        )}
      />
      <CockpitListFooter paged={paged} noun={t("processList.footerNoun")} />
    </WidgetShell>
  )
}
