import { ArrowRight } from "lucide-react"
import {
  FilterBar,
  PagedListFooter,
  StatusBadge,
  WidgetHeader,
  Button,
} from "@miragon/mcp-toolkit-ui"
import {
  HandOffButton,
  PagedRows,
  QueryFallback,
  TableSkeleton,
  WidgetShell,
  formatNumber,
  usePagedListView,
  Icon,
} from "@miragon-ai/widget-shell/widgets"
import { useNav } from "./navigation.js"
import { useHandOff, type HandOff } from "./lib/hand-off.js"
import { EngineMeta } from "./lib/engine-context.js"
import { useT } from "../messages/use-t.js"
import type { ProcessDefinition, ProcessListData } from "../view-models.js"
import { CAMUNDA7_PROCESS_LIST_DATA } from "../tool-names.js"
import {
  ProcessDefinitionsTableView,
  type ProcessDefinitionsTableRow,
} from "./process-definitions-table-view.js"

export type { ProcessListData }

/**
 * Health check of ONE definition version: its metrics over 7 days (analytics,
 * when active) plus this version's live incidents. The version tag is
 * deployer text — quoted, never inlined. The metrics window goes with the
 * analytics tool only: camunda7_list_incidents refuses it.
 */
export function healthCheckHandOff(
  row: ProcessDefinitionsTableRow,
  engine: string | undefined,
): HandOff {
  return {
    intent: "askAi.process.healthCheck",
    ids: {
      engine,
      processDefinitionKey: row.key,
      processDefinitionId: row.id,
    },
    toolIds: {
      analytics_analyze_process_performance: { period: "7d", includeActivityBreakdown: true },
    },
    facts: { version: row.version },
    untrusted: [{ label: "versionTag", text: row.versionTag }],
    tools: ["analytics_analyze_process_performance", "camunda7_list_incidents"],
  }
}

const PAGE_SIZE = 50

// Standalone renders hand in only `data`, so the show tool's scope comes
// from the payload's echo — a page-2 fetch without `latestVersion` would
// mix all versions into a latest-only page 0.
function deriveProcessListScope(
  initialData: ProcessListData | null,
  props: {
    engine?: string
    processDefinitionKey?: string
    nameLike?: string
    latestVersion?: boolean
  },
) {
  const echoed = initialData?.filters
  return {
    feedEngine: props.engine ?? initialData?.engineId,
    effectiveKey: props.processDefinitionKey ?? echoed?.processDefinitionKey,
    baseNameLike: props.nameLike ?? echoed?.nameLike,
    effectiveLatest: props.latestVersion ?? echoed?.latestVersion,
  }
}

function buildProcessListArgs(scope: ReturnType<typeof deriveProcessListScope>) {
  const args: Record<string, unknown> = {}
  if (scope.feedEngine) args.engine = scope.feedEngine
  if (scope.effectiveKey) args.processDefinitionKey = scope.effectiveKey
  if (scope.baseNameLike) args.nameLike = scope.baseNameLike
  if (scope.effectiveLatest !== undefined) args.latestVersion = scope.effectiveLatest
  return args
}

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
  const go = useNav()
  const { ask } = useHandOff()
  const scope = deriveProcessListScope(initialData, {
    engine,
    processDefinitionKey,
    nameLike,
    latestVersion,
  })
  const { feedEngine, effectiveKey, baseNameLike, effectiveLatest } = scope
  const args = buildProcessListArgs(scope)

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
          onRetry={paged.retry}
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
      <WidgetHeader
        title={t("processList.heading")}
        sub={
          <>
            <EngineMeta engineId={feedEngine ?? data.engineId} />
            <span>{t("processList.deployedCount", { count: formatNumber(paged.total) })}</span>
          </>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("processList.searchPlaceholder")}
        searchAriaLabel={t("processList.searchLabel")}
        chips={[]}
        onChipToggle={() => undefined}
      />

      <PagedRows paged={paged}>
        <ProcessDefinitionsTableView
          rows={rows}
          ariaLabel={t("processList.tableAria")}
          emptyText={interacted ? t("processList.noMatch") : t("processList.emptyState")}
          status={{
            header: t("processList.colStatus"),
            render: (row) =>
              row.suspended ? (
                <StatusBadge tone="warning">{t("processList.statusSuspended")}</StatusBadge>
              ) : (
                <StatusBadge tone="success">{t("processList.statusActive")}</StatusBadge>
              ),
          }}
          renderActions={(row) => (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => go({ type: "process-instances", processDefinitionKey: row.key })}
                aria-label={t("cockpitDefs.viewInstancesAria", { name: row.name ?? row.key })}
              >
                {t("cockpitDefs.instancesAction")}
                <Icon icon={ArrowRight} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  go({
                    type: "process-detail",
                    processDefinitionKey: row.key,
                    label: row.name ?? undefined,
                  })
                }
                aria-label={t("cockpitDefs.openDetailAria", { name: row.name ?? row.key })}
              >
                {t("cockpitDefs.openAction")}
                <Icon icon={ArrowRight} />
              </Button>
              <HandOffButton
                action="checkHealth"
                variant="icon"
                prompt={ask(healthCheckHandOff(row, feedEngine ?? data.engineId))}
              />
            </>
          )}
        />
      </PagedRows>
      <PagedListFooter
        paged={paged}
        noun={t("processList.footerNoun")}
        labels={paged.footerLabels}
      />
    </WidgetShell>
  )
}
