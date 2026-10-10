import type { ComponentType, ReactElement } from "react"
import { WidgetFixtureHost } from "@miragon/mcp-toolkit-ui/app"

import type { UserProfileView } from "../lib/profile-schema.js"
import { CAMUNDA7_SAVE_USER_PROFILE, CAMUNDA7_WIDGET_ACTIONS_DATA } from "../tool-names.js"
import type {
  IncidentInstance,
  IncidentRecovery,
  InstanceDetailData,
  JobPanelData,
} from "../view-models.js"
import type { GatingSite } from "./action-gating.sites.js"
import { InstanceDetailWidget } from "./instance-detail.js"
import { VariablesTable } from "./instance-sections.js"
import { JobPanelWidget } from "./job-panel.js"
import { IncidentTable } from "./process-incidents/incident-table.js"
import { useIncidentRecovery } from "./process-incidents/use-incident-recovery.js"
import { UserProfileWidget } from "./user-profile.js"

/** A write site's surface, on a deployment whose feed allows `allowedActions`. */
type Renderer = (allowedActions: readonly string[]) => ReactElement

function host(
  widget: ComponentType<Record<string, unknown>>,
  allowedActions: readonly string[],
  data: unknown = {},
): ReactElement {
  return (
    <WidgetFixtureHost
      widget={widget}
      data={data as Record<string, unknown>}
      tools={{
        [CAMUNDA7_WIDGET_ACTIONS_DATA]: { allowedActions: [...allowedActions], modelTools: [] },
      }}
    />
  )
}

const INSTANCE: InstanceDetailData = {
  instance: {
    id: "pi-1",
    definitionId: "invoice:1:abc",
    businessKey: "INV-7",
    suspended: false,
    ended: false,
  },
  activityTree: null,
  variables: {},
  incidents: [],
  incidentCount: 0,
  bpmnXml: null,
  activeActivityIds: ["review"],
  incidentActivityIds: [],
  openTasks: [
    {
      id: "review",
      name: "Review invoice",
      assignee: null,
      created: "2026-10-10T08:00:00.000+0000",
      due: null,
      priority: 50,
      processDefinitionId: "invoice:1:abc",
      processInstanceId: "pi-1",
      taskDefinitionKey: "review",
      description: null,
      formSchema: { taskId: "review", fields: [] },
    },
  ],
  openTaskCount: 1,
  engineId: "prod",
}

const JOBS: JobPanelData = {
  totalCount: 1,
  failedCount: 1,
  jobs: [
    {
      id: "job-1",
      processInstanceId: "pi-1",
      processDefinitionKey: "invoice",
      processDefinitionId: "invoice:1:abc",
      activityId: "chargeCard",
      retries: 0,
      exceptionMessage: "Card declined",
      dueDate: null,
      suspended: false,
      priority: 0,
      createTime: "2026-06-11T08:00:00.000Z",
    },
  ],
  filters: {},
  engineId: "prod",
}

function profileView(canSave: boolean): UserProfileView {
  return {
    profile: {
      language: "en",
      theme: "system",
      updatedAt: "2026-10-01T00:00:00.000Z",
      defaultEngineId: "prod",
      allowedEngineIds: [],
      pinnedDashboardIds: [],
      preferredRole: "admin",
    },
    availableEngines: [{ id: "prod", environment: "default" }],
    canSave,
  }
}

/** One incident row whose remedy is `recovery`. */
function incidentRows(incidentType: string, recovery: IncidentRecovery) {
  const rows: IncidentInstance[] = [
    {
      id: "inc-1",
      processInstanceId: "pi-1",
      incidentType,
      incidentMessage: "boom",
      incidentTimestamp: "2026-10-10T08:00:00.000+0000",
      cockpitInstanceUrl: null,
      recovery,
    },
  ]
  const Rows: ComponentType<Record<string, unknown>> = () => {
    const recoveryState = useIncidentRecovery("prod", { resetOn: rows })
    return <IncidentTable incidents={rows} recovery={recoveryState} onAnalyze={() => {}} />
  }
  return Rows
}

const Instance = InstanceDetailWidget as unknown as ComponentType<Record<string, unknown>>
const Jobs = JobPanelWidget as unknown as ComponentType<Record<string, unknown>>
const Variables: ComponentType<Record<string, unknown>> = () => (
  <VariablesTable variables={{ amount: { value: 42, type: "Integer" } }} instanceId="pi-1" />
)

/**
 * The render-level half of the in-widget write guard (#341): the surface of
 * every write site in `GATING_SITES` — keyed exhaustively, so a listed site
 * without a surface does not compile.
 */
export const GATING_RENDERERS: Record<GatingSite, Renderer> = {
  "job-panel.tsx#camunda7_set_job_retries": (allowed) => host(Jobs, allowed, JOBS),
  "instance-sections.tsx#camunda7_set_process_instance_variable": (allowed) =>
    host(Variables, allowed),
  "instance-detail/open-tasks.tsx#camunda7_complete_task": (allowed) =>
    host(Instance, allowed, INSTANCE),
  "instance-detail/use-instance-actions.ts#camunda7_set_process_instance_suspension": (allowed) =>
    host(Instance, allowed, INSTANCE),
  "instance-detail/use-instance-actions.ts#camunda7_delete_process_instance": (allowed) =>
    host(Instance, allowed, INSTANCE),
  "process-incidents/use-incident-recovery.ts#camunda7_resolve_incident": (allowed) =>
    host(incidentRows("invoiceMismatch", { action: "resolve" }), allowed),
  "process-incidents/use-incident-recovery.ts#camunda7_set_job_retries": (allowed) =>
    host(incidentRows("failedJob", { action: "retry-job", jobId: "job-1" }), allowed),
  "process-incidents/use-incident-recovery.ts#camunda7_set_external_task_retries": (allowed) =>
    host(
      incidentRows("failedExternalTask", {
        action: "retry-external-task",
        externalTaskId: "ext-1",
      }),
      allowed,
    ),
  // Self-gated: rendered as allowed exactly when the list holds the save.
  "user-profile.tsx#camunda7_save_user_profile": (allowed) => {
    const view = profileView(allowed.includes(CAMUNDA7_SAVE_USER_PROFILE))
    const Panel: ComponentType<Record<string, unknown>> = () => <UserProfileWidget data={view} />
    return host(Panel, allowed)
  },
}
