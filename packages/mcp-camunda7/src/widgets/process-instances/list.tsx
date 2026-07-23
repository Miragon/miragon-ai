import { useState } from "react"
import { ModelContext } from "mcp-use/react"
import {
  AskAiButton,
  CountPill,
  DrillButton,
  FilterBar,
  ListFooter,
  LivePill,
  QueryFallback,
  StatusBadge,
  TONE_DOT,
  TableEmptyState,
  TableSkeleton,
  Td,
  Th,
  WidgetHeader,
  WidgetShell,
  useDebouncedValue,
  usePagedViewData,
  type FilterChip,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"
import type { ProcessInstanceRow, ProcessInstancesData } from "../../view-models.js"
import { useNav } from "../navigation.js"
import { CAMUNDA7_PROCESS_INSTANCES_DATA } from "../../tool-names.js"
import { useT } from "../../messages/use-t.js"

const PAGE_SIZE = 50

export type { ProcessInstancesData }

const CHIP_ALL = "all"
const CHIP_INCIDENTS = "incidents"
const CHIP_SUSPENDED = "suspended"

type InstanceChip = typeof CHIP_ALL | typeof CHIP_INCIDENTS | typeof CHIP_SUSPENDED

/**
 * Client-side mirror of the `camunda7_process_instances_data` filter contract
 * (paging args are owned by `usePagedViewData`).
 */
type InstancesFilterArgs = {
  processDefinitionKey?: string
  engine?: string
  active?: boolean
  suspended?: boolean
  withIncidentsOnly?: boolean
  businessKeyLike?: string
}

function rowTone(row: ProcessInstanceRow): ToneVariant {
  if (row.hasIncident) return "critical"
  if (row.suspended) return "warning"
  return "neutral"
}

function InstanceRow({
  row,
  processDefinitionKey,
  engine,
  onOpen,
}: {
  row: ProcessInstanceRow
  processDefinitionKey: string
  engine: string
  onOpen: (processInstanceId: string) => void
}) {
  const t = useT()
  const tone = rowTone(row)
  return (
    <tr className="hover:bg-muted transition-colors">
      <Td>
        <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
          <span className={`size-1.5 rounded-full ${TONE_DOT[tone]}`} />
          <span className="truncate">{row.businessKey ?? "—"}</span>
        </div>
        <div className="text-muted-foreground mt-0.5 font-mono text-xs">{row.id}</div>
      </Td>
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
              prompt={`Root-cause the incident on CIB Seven process instance ${row.id}${row.businessKey ? ` (business key ${row.businessKey})` : ""}, version v${row.version} of process ${processDefinitionKey} (engine ${engine}). Use camunda7_get_process_instance, camunda7_list_incidents (processInstanceId ${row.id}) and the failed job's stacktrace to explain why it failed in plain language. Then check via camunda7_list_incidents (processDefinitionKey ${processDefinitionKey}) whether other running instances of this process fail the same way, and recommend a concrete fix: job retry, a variable change (name the variable), or a modification — including whether to apply it to just this instance or the whole cluster.`}
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
  const [search, setSearch] = useState("")
  const [activeChip, setActiveChip] = useState<InstanceChip>(CHIP_ALL)
  const debouncedSearch = useDebouncedValue(search.trim(), 300)

  const pdk = processDefinitionKey ?? initialData?.processDefinitionKey
  const resolvedEngine = engine ?? "default"

  // Filters are SERVER-side: the chips and the search box re-query the feed
  // (search debounced) so they cover the whole result set, not just the loaded
  // page. Pagination is offset-based with an explicit "Load more" (see footer).
  const wantIncidents = activeChip === CHIP_INCIDENTS || !!withIncidentsOnly
  const wantSuspended = activeChip === CHIP_SUSPENDED || !!suspended
  const effectiveBusinessKey = debouncedSearch || businessKeyLike
  const filterArgs: InstancesFilterArgs = { processDefinitionKey: pdk, engine }
  if (active) filterArgs.active = true
  if (wantIncidents) filterArgs.withIncidentsOnly = true
  if (wantSuspended) filterArgs.suspended = true
  if (effectiveBusinessKey) filterArgs.businessKeyLike = effectiveBusinessKey

  // Once the operator searches/filters, drop the handed-in page and self-fetch
  // the server-filtered set (standalone data is only the unfiltered first page).
  const interacted = debouncedSearch !== "" || activeChip !== CHIP_ALL
  const paged = usePagedViewData<ProcessInstanceRow, ProcessInstancesData>({
    initialData: interacted ? null : initialData,
    key: ["camunda7:process-instances", engine ?? null, pdk ?? null],
    tool: CAMUNDA7_PROCESS_INSTANCES_DATA,
    args: filterArgs,
    pageSize: PAGE_SIZE,
    ready: !!pdk,
    selectItems: (d) => d.instances,
    selectTotal: (d) => d.totalCount,
  })
  const data = paged.firstPage

  if (!data) {
    if (!pdk) {
      return <TableEmptyState>{t("processInstances.noDefinitionSelected")}</TableEmptyState>
    }
    return (
      <QueryFallback
        isError={!!paged.error}
        error={paged.error}
        errorTitle={t("processInstances.loadError")}
        skeleton={<TableSkeleton />}
      />
    )
  }

  const title = data.processDefinitionName ?? data.processDefinitionKey

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
          `Viewing ${paged.items.length} of ${paged.total} running instances of process "${title}" (${data.processDefinitionKey}) on engine ${resolvedEngine}${
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
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-xs">{data.processDefinitionKey}</span>
          </>
        }
        actions={
          <AskAiButton
            variant="primary"
            prompt={`Triage the running instances of CIB Seven process "${title}" (key ${data.processDefinitionKey}, engine ${resolvedEngine}). There are ${paged.total} running instances total. Use camunda7_list_incidents (processDefinitionKey ${data.processDefinitionKey}) and camunda7_query_historic_activity_instances to group the incidents by failed activity and incident type, identify the dominant failure mode, and tell me how many instances are likely fixable by a job retry vs. needing a variable change or modification. Give me a prioritized triage: which cluster to fix first and the single recommended remediation per cluster. Do not mutate anything yet — recommendations only.`}
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
          <table
            className="w-full border-collapse text-sm"
            aria-label={t("processInstances.tableAriaLabel", { name: title })}
          >
            <thead className="bg-muted">
              <tr>
                <Th>{t("processInstances.colBusinessKey")}</Th>
                <Th>{t("processInstances.colVersion")}</Th>
                <Th>{t("processInstances.colState")}</Th>
                <Th align="right">{t("processInstances.colIncident")}</Th>
                <Th plain />
              </tr>
            </thead>
            <tbody>
              {paged.items.map((row) => (
                <InstanceRow
                  key={row.id}
                  row={row}
                  processDefinitionKey={data.processDefinitionKey}
                  engine={resolvedEngine}
                  onOpen={(id) => go({ type: "instance-detail", processInstanceId: id })}
                />
              ))}
            </tbody>
          </table>
          {/* Load-more failures land here (page 0 failures render above): the
              already-loaded rows stay visible, the failure is inline + retryable. */}
          {paged.error && (
            <div role="alert" className="text-critical flex items-center gap-2 text-xs">
              <span>{t("processInstances.loadMoreError", { message: paged.error.message })}</span>
              <button
                type="button"
                onClick={paged.loadMore}
                className="border-border bg-card hover:bg-muted focus-visible:ring-ring rounded-md border px-2 py-1 font-medium outline-none focus-visible:ring-2"
              >
                {t("processInstances.retryLoadMore")}
              </button>
            </div>
          )}
          <ListFooter
            shown={paged.items.length}
            total={paged.total}
            hasMore={paged.hasMore}
            loadingMore={paged.loadingMore}
            onLoadMore={paged.loadMore}
            noun={t("processInstances.footerNoun")}
          />
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
