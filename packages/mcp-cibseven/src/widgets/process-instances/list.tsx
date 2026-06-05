import { useMemo, useState } from "react"
import { Alert, AlertDescription, useToolQuery } from "@miragon/mcp-toolkit-ui"
import { ModelContext } from "mcp-use/react"
import {
  CountPill,
  FilterBar,
  LivePill,
  StatusBadge,
  TONE_DOT,
  WidgetHeader,
  WidgetShell,
  type FilterChip,
  type ToneVariant,
} from "@miragon-ai/widget-shell/widgets"
import type { ProcessInstanceRow, ProcessInstancesData } from "@miragon-ai/client-cibseven"
import { useNav } from "../navigation.js"
import { CAMUNDA7_PROCESS_INSTANCES_DATA } from "../../tool-names.js"

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
  onOpen,
}: {
  row: ProcessInstanceRow
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
        <button
          type="button"
          onClick={() => onOpen(row.id)}
          aria-label={`Open instance detail for ${row.businessKey ?? row.id}`}
          className="bg-m-blue-soft text-m-blue hover:bg-m-blue/10 focus-visible:ring-ring inline-flex items-center gap-1 rounded-md border border-transparent px-2.5 py-1 text-xs font-semibold outline-none focus-visible:ring-2"
        >
          Open <span aria-hidden>→</span>
        </button>
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

  // Self-fetch fallback so the widget also works when rendered standalone
  // (e.g. refreshed from the host) rather than only via eager initialData.
  const queryArgs: Record<string, unknown> = {}
  if (processDefinitionKey) queryArgs.processDefinitionKey = processDefinitionKey
  if (engine) queryArgs.engine = engine
  if (active) queryArgs.active = active
  if (suspended) queryArgs.suspended = suspended
  if (withIncidentsOnly) queryArgs.withIncidentsOnly = withIncidentsOnly
  if (businessKeyLike) queryArgs.businessKeyLike = businessKeyLike
  const fallbackQuery = useToolQuery<ProcessInstancesData>(
    ["camunda7:process-instances", engine ?? null, processDefinitionKey ?? null],
    CAMUNDA7_PROCESS_INSTANCES_DATA,
    queryArgs,
    { enabled: !initialData && !!processDefinitionKey },
  )
  const data = initialData ?? fallbackQuery.data ?? null

  const visible = useMemo<ProcessInstanceRow[]>(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    return data.instances.filter((row) => {
      if (activeChip === CHIP_INCIDENTS && !row.hasIncident) return false
      if (activeChip === CHIP_SUSPENDED && !row.suspended) return false
      if (q.length === 0) return true
      return (row.businessKey ?? "").toLowerCase().includes(q) || row.id.toLowerCase().includes(q)
    })
  }, [data, search, activeChip])

  if (!data) {
    return fallbackQuery.isError ? (
      <Alert variant="destructive">
        <AlertDescription>{fallbackQuery.error.message}</AlertDescription>
      </Alert>
    ) : (
      <Alert>
        <AlertDescription>
          {processDefinitionKey ? "Loading process instances…" : "No process definition selected."}
        </AlertDescription>
      </Alert>
    )
  }

  const title = data.processDefinitionName ?? data.processDefinitionKey
  const capped = data.totalCount > data.returnedCount

  const chips: FilterChip[] = [
    { id: CHIP_ALL, label: "All", count: data.returnedCount, active: activeChip === CHIP_ALL },
    {
      id: CHIP_INCIDENTS,
      label: "With incidents",
      count: data.withIncidentCount,
      active: activeChip === CHIP_INCIDENTS,
    },
    {
      id: CHIP_SUSPENDED,
      label: "Suspended",
      count: data.suspendedCount,
      active: activeChip === CHIP_SUSPENDED,
    },
  ]

  return (
    <>
      {/* Keep the agent aware of what the operator is looking at so it can offer
          the obvious next steps (drill into an instance, retry/suspend, etc.). */}
      <ModelContext
        content={[
          `Viewing ${data.returnedCount}${capped ? ` of ${data.totalCount}` : ""} running instances of process "${title}" (${data.processDefinitionKey}).`,
          `${data.withIncidentCount} have an open incident, ${data.suspendedCount} are suspended.`,
          `Drill into one with camunda7_show_instance_detail (processInstanceId); act with camunda7_suspend_process_instance / camunda7_activate_process_instance / camunda7_delete_process_instance / camunda7_set_job_retries.`,
        ].join(" ")}
      />
      <WidgetHeader
        icon="▶"
        iconTone="info"
        title={title}
        sub={
          <>
            <LivePill tone="info">{data.returnedCount} running</LivePill>
            {capped && <span>of {data.totalCount.toLocaleString()} total</span>}
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-xs">{data.processDefinitionKey}</span>
          </>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Filter by business key or instance id…"
        chips={chips}
        onChipToggle={(id) => setActiveChip(id === activeChip ? CHIP_ALL : id)}
      />

      {visible.length === 0 ? (
        <div className="border-border text-muted-foreground bg-card rounded-lg border p-8 text-center text-sm">
          {data.instances.length === 0
            ? "No running instances for this process definition."
            : "No instances match the current filter."}
        </div>
      ) : (
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
            {visible.map((row) => (
              <InstanceRow
                key={row.id}
                row={row}
                onOpen={(id) => go({ type: "instance-detail", processInstanceId: id })}
              />
            ))}
          </tbody>
        </table>
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
