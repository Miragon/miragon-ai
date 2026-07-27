import { ModelContext } from "mcp-use/react"
import {
  AskAiButton,
  CountPill,
  DrillButton,
  FilterBar,
  ListTable,
  LivePill,
  QueryFallback,
  StatusBadge,
  TONE_DOT,
  TableEmptyState,
  TableSkeleton,
  Td,
  WidgetHeader,
  WidgetShell,
  usePagedListView,
  type FilterChip,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"
import { useState } from "react"
import type { ProcessInstanceRow, ProcessInstancesData } from "../../view-models.js"
import type { ProcessInstancesFilters } from "../../feed-contracts.js"
import { useNav } from "../navigation.js"
import { CAMUNDA7_PROCESS_INSTANCES_DATA } from "../../tool-names.js"
import { CockpitListFooter } from "../list-footer.js"
import { useT } from "../../messages/use-t.js"

const PAGE_SIZE = 50

export type { ProcessInstancesData }

const CHIP_ALL = "all"
const CHIP_INCIDENTS = "incidents"
const CHIP_SUSPENDED = "suspended"

type InstanceChip = typeof CHIP_ALL | typeof CHIP_INCIDENTS | typeof CHIP_SUSPENDED

/**
 * The `camunda7_process_instances_data` filter contract, derived from the
 * shared feed shapes (type-only import — no runtime zod here). Paging args
 * are owned by `usePagedViewData`; `engine` by the resolve-engine override.
 */
type InstancesFilterArgs = Partial<ProcessInstancesFilters> & { engine?: string }

function rowTone(row: ProcessInstanceRow): ToneVariant {
  if (row.hasIncident) return "critical"
  if (row.suspended) return "warning"
  return "neutral"
}

function InstanceRow({
  row,
  processDefinitionKey,
  engine,
  showProcessColumn,
  onOpen,
  onOpenProcess,
}: {
  row: ProcessInstanceRow
  /** The list's definition scope — null in the engine-wide list. */
  processDefinitionKey: string | null
  engine: string
  /** Engine-wide list: each row names (and drills into) its own definition. */
  showProcessColumn: boolean
  onOpen: (processInstanceId: string) => void
  onOpenProcess: (processDefinitionKey: string) => void
}) {
  const t = useT()
  const tone = rowTone(row)
  const promptKey = processDefinitionKey ?? row.processDefinitionKey ?? "unknown"
  return (
    <tr className="hover:bg-muted transition-colors">
      <Td>
        <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
          <span className={`size-1.5 rounded-full ${TONE_DOT[tone]}`} />
          <span className="truncate">{row.businessKey ?? "—"}</span>
        </div>
        <div className="text-muted-foreground mt-0.5 font-mono text-xs">{row.id}</div>
      </Td>
      {showProcessColumn && (
        <Td>
          {row.processDefinitionKey ? (
            <button
              type="button"
              onClick={() => onOpenProcess(row.processDefinitionKey ?? "")}
              className="text-m-blue font-mono text-xs hover:underline"
              aria-label={t("processInstances.openProcessAria", {
                key: row.processDefinitionKey,
              })}
            >
              {row.processDefinitionKey}
            </button>
          ) : (
            <span className="text-muted-foreground font-mono text-xs">—</span>
          )}
        </Td>
      )}
      <Td>
        {row.version !== null ? (
          <span className="border-border bg-muted text-muted-foreground inline-block rounded border px-1.5 py-0.5 font-mono text-xs">
            v{row.version}
          </span>
        ) : (
          <span className="text-muted-foreground font-mono text-xs">—</span>
        )}
      </Td>
      <Td>
        {row.suspended ? (
          <StatusBadge tone="warning">{t("processInstances.stateSuspended")}</StatusBadge>
        ) : (
          <span className="text-muted-foreground text-xs">
            {t("processInstances.stateRunning")}
          </span>
        )}
      </Td>
      <Td align="right">
        {row.hasIncident ? (
          <CountPill tone="critical">!</CountPill>
        ) : (
          <span className="text-muted-foreground font-mono text-xs">—</span>
        )}
      </Td>
      <Td align="right">
        <div className="inline-flex items-center justify-end gap-1">
          {row.hasIncident && (
            <AskAiButton
              variant="icon"
              label={t("processInstances.analyzeLabel")}
              title={t("processInstances.analyzeLabel")}
              prompt={`Root-cause the incident on CIB Seven process instance ${row.id}${row.businessKey ? ` (business key ${row.businessKey})` : ""}, version v${row.version} of process ${promptKey} (engine ${engine}). Use camunda7_get_process_instance, camunda7_list_incidents (processInstanceId ${row.id}) and the failed job's stacktrace to explain why it failed in plain language. Then check via camunda7_list_incidents (processDefinitionKey ${promptKey}) whether other running instances of this process fail the same way, and recommend a concrete fix: job retry, a variable change (name the variable), or a modification — including whether to apply it to just this instance or the whole cluster.`}
            />
          )}
          <DrillButton
            onDrill={() => onOpen(row.id)}
            ariaLabel={t("processInstances.openInstanceAria", { name: row.businessKey ?? row.id })}
          >
            {t("processInstances.openButton")}
          </DrillButton>
        </div>
      </Td>
    </tr>
  )
}

/** Shell-less running-instances list. Reused standalone and in the cockpit app. */
export function ProcessInstancesView({
  data: initialData = null,
  processDefinitionKey,
  engine,
  active,
  suspended,
  withIncidentsOnly,
  businessKeyLike,
}: {
  data?: ProcessInstancesData | null
  processDefinitionKey?: string
  engine?: string
  active?: boolean
  suspended?: boolean
  withIncidentsOnly?: boolean
  businessKeyLike?: string
}) {
  const t = useT()
  const go = useNav()
  const [activeChip, setActiveChip] = useState<InstanceChip>(CHIP_ALL)

  const pdk = processDefinitionKey ?? initialData?.processDefinitionKey
  // Standalone renders hand in only `data` (no props), so the scope the show
  // tool was called with must come from the payload's echo: loadMore/search
  // must page the SAME engine and filter set as page 0 — not the sticky
  // default and not an unfiltered view.
  const echoed = initialData?.filters
  const feedEngine = engine ?? initialData?.engineId
  const resolvedEngine = feedEngine ?? "default"

  // Filters are SERVER-side: the chips and the search box re-query the feed
  // (search debounced by the scaffold) so they cover the whole result set, not
  // just the loaded page. Pagination is offset-based with an explicit
  // "Load more" (see footer).
  const wantIncidents =
    activeChip === CHIP_INCIDENTS || !!(withIncidentsOnly ?? echoed?.withIncidentsOnly)
  const wantSuspended = activeChip === CHIP_SUSPENDED || !!(suspended ?? echoed?.suspended)
  const baseBusinessKey = businessKeyLike ?? echoed?.businessKeyLike
  // No definition scope → the ENGINE-WIDE running-instances list (the
  // overview's "Running instances" KPI drills here).
  const filterArgs: InstancesFilterArgs = {}
  if (pdk) filterArgs.processDefinitionKey = pdk
  if (feedEngine) filterArgs.engine = feedEngine
  if (active ?? echoed?.active) filterArgs.active = true
  if (wantIncidents) filterArgs.withIncidentsOnly = true
  if (wantSuspended) filterArgs.suspended = true
  if (baseBusinessKey) filterArgs.businessKeyLike = baseBusinessKey

  const { paged, search, setSearch, debouncedSearch, interacted } = usePagedListView<
    ProcessInstanceRow,
    ProcessInstancesData
  >({
    initialData,
    key: ["camunda7:process-instances", feedEngine ?? null, pdk ?? null],
    tool: CAMUNDA7_PROCESS_INSTANCES_DATA,
    args: filterArgs,
    // The operator's search overrides a handed-in businessKeyLike prefilter.
    searchArg: "businessKeyLike",
    filtersActive: activeChip !== CHIP_ALL,
    pageSize: PAGE_SIZE,
    ready: true,
    selectItems: (d) => d.instances,
    selectTotal: (d) => d.totalCount,
  })
  const data = paged.firstPage

  if (!data) {
    return (
      <QueryFallback
        isError={!!paged.error}
        error={paged.error}
        errorTitle={t("processInstances.loadError")}
        skeleton={<TableSkeleton />}
      />
    )
  }

  const scopedKey = data.processDefinitionKey
  const title = data.processDefinitionName ?? scopedKey ?? t("processInstances.allTitle")

  const chips: FilterChip[] = [
    { id: CHIP_ALL, label: t("processInstances.chipAll"), active: activeChip === CHIP_ALL },
    {
      id: CHIP_INCIDENTS,
      label: t("processInstances.chipWithIncidents"),
      active: activeChip === CHIP_INCIDENTS,
    },
    {
      id: CHIP_SUSPENDED,
      label: t("processInstances.chipSuspended"),
      active: activeChip === CHIP_SUSPENDED,
    },
  ]

  return (
    <>
      {/* Keep the agent aware of what the operator is looking at so it can offer
          the obvious next steps (drill into an instance, retry/suspend, etc.). */}
      <ModelContext
        content={[
          `Viewing ${paged.items.length} of ${paged.total} running instances ${
            scopedKey ? `of process "${title}" (${scopedKey})` : "across ALL process definitions"
          } on engine ${resolvedEngine}${
            activeChip !== CHIP_ALL ? ` — filtered to "${activeChip}"` : ""
          }${debouncedSearch ? ` — business key matching "${debouncedSearch}"` : ""}.`,
          `Drill into one with camunda7_show_instance_detail (processInstanceId); act with camunda7_set_process_instance_suspension (suspended true/false) / camunda7_delete_process_instance / camunda7_set_job_retries.`,
        ].join(" ")}
      />
      <WidgetHeader
        icon="▶"
        iconTone="info"
        title={title}
        sub={
          <>
            <LivePill tone="info">
              {t("processInstances.runningCount", { count: paged.total.toLocaleString() })}
            </LivePill>
            {scopedKey && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono text-xs">{scopedKey}</span>
              </>
            )}
          </>
        }
        actions={
          <AskAiButton
            variant="primary"
            prompt={
              scopedKey
                ? `Triage the running instances of CIB Seven process "${title}" (key ${scopedKey}, engine ${resolvedEngine}). There are ${paged.total} running instances total. Use camunda7_list_incidents (processDefinitionKey ${scopedKey}) and camunda7_query_historic_activity_instances to group the incidents by failed activity and incident type, identify the dominant failure mode, and tell me how many instances are likely fixable by a job retry vs. needing a variable change or modification. Give me a prioritized triage: which cluster to fix first and the single recommended remediation per cluster. Do not mutate anything yet — recommendations only.`
                : `Triage the running process instances on CIB Seven engine ${resolvedEngine} — ${paged.total} across all definitions. Use camunda7_list_incidents (engine ${resolvedEngine}) to group the current failures by process definition, failed activity and incident type, identify which definitions carry the most incident-affected instances, and tell me how many are likely fixable by a job retry vs. needing a variable change or modification. Give me a prioritized triage per definition. Do not mutate anything yet — recommendations only.`
            }
          />
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("processInstances.searchPlaceholder")}
        chips={chips}
        onChipToggle={(id) => setActiveChip(id === activeChip ? CHIP_ALL : (id as InstanceChip))}
      />

      {paged.items.length === 0 ? (
        <TableEmptyState>
          {interacted ? t("processInstances.noMatch") : t("processInstances.noRunningInstances")}
        </TableEmptyState>
      ) : (
        <>
          <ListTable
            ariaLabel={t("processInstances.tableAriaLabel", { name: title })}
            columns={[
              { label: t("processInstances.colBusinessKey") },
              ...(scopedKey ? [] : [{ label: t("processInstances.colProcess") }]),
              { label: t("processInstances.colVersion") },
              { label: t("processInstances.colState") },
              { label: t("processInstances.colIncident"), align: "right" as const },
              { plain: true },
            ]}
          >
            {paged.items.map((row) => (
              <InstanceRow
                key={row.id}
                row={row}
                processDefinitionKey={scopedKey}
                engine={resolvedEngine}
                showProcessColumn={!scopedKey}
                onOpen={(id) => go({ type: "instance-detail", processInstanceId: id })}
                onOpenProcess={(key) => go({ type: "process-detail", processDefinitionKey: key })}
              />
            ))}
          </ListTable>
          <CockpitListFooter paged={paged} noun={t("processInstances.footerNoun")} />
        </>
      )}
    </>
  )
}

export function ProcessInstancesWidget(props: {
  data: ProcessInstancesData | null
  processDefinitionKey?: string
  engine?: string
  active?: boolean
  suspended?: boolean
  withIncidentsOnly?: boolean
  businessKeyLike?: string
}) {
  return (
    <WidgetShell>
      <ProcessInstancesView {...props} />
    </WidgetShell>
  )
}
