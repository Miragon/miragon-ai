import type { CAMUNDA7_SAVE_USER_PROFILE, Camunda7WidgetAction } from "../../tool-names.js"

/**
 * Every write a widget performs: the engine writes the deployment's toolset
 * gates (`CAMUNDA7_WIDGET_ACTIONS`) plus the settings panel's profile save,
 * which its view gates itself (`canSave` — it also needs a signed-in caller).
 */
export type WidgetWrite = Camunda7WidgetAction | typeof CAMUNDA7_SAVE_USER_PROFILE

export interface WritePolicy {
  /**
   * The query-key namespaces (first key segment) whose data the write
   * changes — invalidated after it succeeds: mounted queries refetch, the
   * rest refetch on their next mount. A view whose subject the write REMOVES
   * (a cancelled instance, a cleared incident) is left out on purpose: its
   * refetch could only answer "not found", and the write's own result is
   * what the view shows.
   */
  invalidates: readonly string[]
  /**
   * Irreversible or engine-state-changing writes ask first, in a dialog that
   * names the target (`useEngineAction` refuses to run them without one).
   */
  confirm: boolean
}

/**
 * What a recovered incident changes: every incident count and list, the
 * instance and job views, and the instance lists' per-row incident flag
 * (`ProcessInstanceRow.hasIncident`, the list's "incidents" chip).
 */
const INCIDENT_VIEWS = [
  "camunda7:process-incidents",
  "camunda7:activity-incidents",
  "camunda7:incidents",
  "camunda7:cluster-detail",
  "camunda7:engine-health",
  "camunda7:jobs",
  "camunda7:instance-detail",
  "camunda7:process-instances",
  "camunda7:bpmn-viewer",
  "camunda7:cockpit-overview",
  "camunda7:process-list",
] as const

/** What an instance's state or tokens change: its lists, counts and diagram overlays. */
const INSTANCE_LISTS = [
  "camunda7:process-instances",
  "camunda7:process-list",
  "camunda7:cockpit-overview",
  "camunda7:bpmn-viewer",
] as const

/** The namespaces once each — a write invalidates every one of them a single time. */
function views(...namespaces: string[]): readonly string[] {
  return [...new Set(namespaces)]
}

/**
 * The single source of what each widget write changes and whether it asks
 * first — a property of the write, never of the button that triggers it, so
 * two surfaces running the same tool can never disagree.
 */
export const WRITE_POLICY: Record<WidgetWrite, WritePolicy> = {
  camunda7_set_job_retries: { invalidates: INCIDENT_VIEWS, confirm: false },
  camunda7_set_external_task_retries: { invalidates: INCIDENT_VIEWS, confirm: false },
  camunda7_resolve_incident: { invalidates: INCIDENT_VIEWS, confirm: true },
  // The next task, the status, the tokens and the variables (the form's
  // values) of the instance — both detail views list them; the jobs the next
  // activities create (timers, async continuations); and, when the task was
  // the last one, every running-instance count (definition view, engine health).
  camunda7_complete_task: {
    invalidates: views(
      "camunda7:instance-detail",
      "camunda7:incident-detail",
      "camunda7:instance-history",
      "camunda7:jobs",
      "camunda7:process-incidents",
      "camunda7:engine-health",
      ...INSTANCE_LISTS,
    ),
    confirm: false,
  },
  // Both detail views list the instance's variables.
  camunda7_set_process_instance_variable: {
    invalidates: [
      "camunda7:instance-detail",
      "camunda7:incident-detail",
      "camunda7:instance-history",
    ],
    confirm: false,
  },
  camunda7_set_process_instance_suspension: {
    invalidates: views("camunda7:instance-detail", "camunda7:jobs", ...INSTANCE_LISTS),
    confirm: true,
  },
  // The instance itself is gone — its detail view keeps the cancelled state.
  camunda7_delete_process_instance: {
    invalidates: views(
      ...INSTANCE_LISTS,
      ...INCIDENT_VIEWS.filter((key) => key !== "camunda7:instance-detail"),
    ),
    confirm: true,
  },
  // The panel itself, the engine list it curates, and the app root's locale/theme gate.
  camunda7_save_user_profile: {
    invalidates: ["camunda7:user-profile", "camunda7:engines", "camunda7:profile-gate"],
    confirm: false,
  },
}
