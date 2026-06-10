import { useState } from "react"
import { Alert, AlertDescription } from "@miragon/mcp-toolkit-ui"
import { ModelContext } from "mcp-use/react"
import {
  AskAiButton,
  CountPill,
  DrillButton,
  FilterBar,
  ListFooter,
  LivePill,
  StatusBadge,
  TONE_DOT,
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

const PAGE_SIZE = 50

export type { ProcessInstancesData }

const CHIP_ALL = "all"
const CHIP_INCIDENTS = "incidents"
const CHIP_SUSPENDED = "suspended"

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
  const tone = rowTone(row)
  return (
    <tr className="hover:bg-muted transition-colors">
      <td className="border-border border-b px-4 py-3 align-middle">
        <div className="text-foreground flex items-center gap-2 text-sm font-semibold">
          <span className={`size-1.5 rounded-full ${TONE_DOT[tone]}`} />
          <span className="truncate">{row.businessKey ?? "—"}</span>
        </div>
        <div className="text-muted-foreground mt-0.5 font-mono text-xs">{row.id}</div>
      </td>
      <td className="border-border border-b px-4 py-3 align-middle">
        {row.version !== null ? (
          <span className="border-border bg-muted text-muted-foreground inline-block rounded border px-1.5 py-0.5 font-mono text-xs">
            v{row.version}
          </span>
        ) : (
          <span className="text-muted-foreground font-mono text-xs">—</span>
        )}
      </td>
      <td className="border-border border-b px-4 py-3 align-middle">
        {row.suspended ? (
          <StatusBadge tone="warning">Suspended</StatusBadge>
        ) : (
          <span className="text-muted-foreground text-xs">Running</span>
        )}
      </td>
      <td className="border-border border-b px-4 py-3 text-right align-middle">
        {row.hasIncident ? (
          <CountPill tone="critical">!</CountPill>
        ) : (
          <span className="text-muted-foreground font-mono text-xs">—</span>
        )}
      </td>
      <td className="border-border border-b px-4 py-3 text-right align-middle">
        <div className="inline-flex items-center justify-end gap-1">
          {row.hasIncident && (
            <AskAiButton
              variant="icon"
              label="Analyze"
              title="Analyze"
              prompt={`Root-cause the incident on CIB Seven process instance ${row.id}${row.businessKey ? ` (business key ${row.businessKey})` : ""}, version v${row.version} of process ${processDefinitionKey} (engine ${engine}). Use camunda7_get_process_instance, camunda7_list_incidents (processInstanceId ${row.id}) and the failed job's stacktrace to explain why it failed in plain language. Then check via camunda7_list_incidents (processDefinitionKey ${processDefinitionKey}) whether other running instances of this process fail the same way, and recommend a concrete fix: job retry, a variable change (name the variable), or a modification — including whether to apply it to just this instance or the whole cluster.`}
            />
          )}
          <DrillButton
            onClick={() => onOpen(row.id)}
            ariaLabel={`Open instance detail for ${row.businessKey ?? row.id}`}
          >
            Open
          </DrillButton>
        </div>
      </td>
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
  const go = useNav()
  const [search, setSearch] = useState("")
  const [activeChip, setActiveChip] = useState<string>(CHIP_ALL)
  const debouncedSearch = useDebouncedValue(search.trim(), 300)

  const pdk = processDefinitionKey ?? initialData?.processDefinitionKey
  const resolvedEngine = engine ?? "default"

  // Filters are SERVER-side: the chips and the search box re-query the feed
  // (search debounced) so they cover the whole result set, not just the loaded
  // page. Pagination is offset-based with an explicit "Load more" (see footer).
  const wantIncidents = activeChip === CHIP_INCIDENTS || !!withIncidentsOnly
  const wantSuspended = activeChip === CHIP_SUSPENDED || !!suspended
  const effectiveBusinessKey = debouncedSearch || businessKeyLike
  const filterArgs: Record<string, unknown> = { processDefinitionKey: pdk, engine }
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
    if (paged.error) {
      return (
        <Alert variant="destructive">
          <AlertDescription>{paged.error.message}</AlertDescription>
        </Alert>
      )
    }
    return (
      <Alert>
        <AlertDescription>
          {!pdk
            ? "No process definition selected."
            : paged.loading
              ? "Loading process instances…"
              : "No running instances for this process definition."}
        </AlertDescription>
      </Alert>
    )
  }

  const title = data.processDefinitionName ?? data.processDefinitionKey

  const chips: FilterChip[] = [
    { id: CHIP_ALL, label: "All", active: activeChip === CHIP_ALL },
    { id: CHIP_INCIDENTS, label: "With incidents", active: activeChip === CHIP_INCIDENTS },
    { id: CHIP_SUSPENDED, label: "Suspended", active: activeChip === CHIP_SUSPENDED },
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
          `Drill into one with camunda7_show_instance_detail (processInstanceId); act with camunda7_suspend_process_instance / camunda7_activate_process_instance / camunda7_delete_process_instance / camunda7_set_job_retries.`,
        ].join(" ")}
      />
      <WidgetHeader
        icon="▶"
        iconTone="info"
        title={title}
        sub={
          <>
            <LivePill tone="info">{paged.total.toLocaleString()} running</LivePill>
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
        searchPlaceholder="Search by business key…"
        chips={chips}
        onChipToggle={(id) => setActiveChip(id === activeChip ? CHIP_ALL : id)}
      />

      {paged.items.length === 0 ? (
        <div className="border-border text-muted-foreground bg-card rounded-lg border p-8 text-center text-sm">
          No instances match the current filter.
        </div>
      ) : (
        <>
          <table
            className="w-full border-collapse text-sm"
            aria-label={`Running instances of ${title}`}
          >
            <thead className="bg-muted">
              <tr>
                <th
                  scope="col"
                  className="border-border text-muted-foreground border-y px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                >
                  Business key / ID
                </th>
                <th
                  scope="col"
                  className="border-border text-muted-foreground border-y px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                >
                  Version
                </th>
                <th
                  scope="col"
                  className="border-border text-muted-foreground border-y px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide"
                >
                  State
                </th>
                <th
                  scope="col"
                  className="border-border text-muted-foreground border-y px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide"
                >
                  Incident
                </th>
                <th scope="col" className="border-border border-y px-4 py-2.5" />
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
          <ListFooter
            shown={paged.items.length}
            total={paged.total}
            hasMore={paged.hasMore}
            loadingMore={paged.loadingMore}
            onLoadMore={paged.loadMore}
            noun="instances"
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
