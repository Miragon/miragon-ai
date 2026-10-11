import { CAMUNDA7_SAVE_USER_PROFILE } from "../tool-names.js"
import type { WidgetWrite } from "./lib/write-policy.js"

/**
 * Every `useEngineAction` call site — `<path under src/widgets>#<tool>` — with
 * the control its write renders. `src/widget-actions.test.ts` holds this list
 * EQUAL to the call sites it finds in the sources, so a new write site cannot
 * ship without an entry; `action-gating.test.tsx` renders every entry (the
 * renderer is keyed by site, exhaustively) with the write offered and with
 * everything BUT the write offered — the control must be there, then gone.
 */
export const GATING_SITES = [
  {
    site: "job-panel.tsx#camunda7_set_job_retries",
    write: "camunda7_set_job_retries",
    control: "Retry job",
  },
  {
    site: "instance-sections.tsx#camunda7_set_process_instance_variable",
    write: "camunda7_set_process_instance_variable",
    control: "Edit",
  },
  {
    site: "instance-detail/open-tasks.tsx#camunda7_complete_task",
    write: "camunda7_complete_task",
    control: "Complete",
  },
  {
    site: "instance-detail/use-instance-actions.ts#camunda7_set_process_instance_suspension",
    write: "camunda7_set_process_instance_suspension",
    control: "Suspend",
  },
  {
    site: "instance-detail/use-instance-actions.ts#camunda7_delete_process_instance",
    write: "camunda7_delete_process_instance",
    control: "Cancel instance",
  },
  {
    site: "process-incidents/use-incident-recovery.ts#camunda7_resolve_incident",
    write: "camunda7_resolve_incident",
    control: "Mark as resolved",
  },
  {
    site: "process-incidents/use-incident-recovery.ts#camunda7_set_job_retries",
    write: "camunda7_set_job_retries",
    control: "Retry",
  },
  {
    site: "process-incidents/use-incident-recovery.ts#camunda7_set_external_task_retries",
    write: "camunda7_set_external_task_retries",
    control: "Retry",
  },
  {
    // Self-gated: the view's `canSave` (toolset AND a signed-in caller).
    site: "user-profile.tsx#camunda7_save_user_profile",
    write: CAMUNDA7_SAVE_USER_PROFILE,
    control: "Save",
  },
] as const satisfies ReadonlyArray<{ site: string; write: WidgetWrite; control: string }>

export type GatingSite = (typeof GATING_SITES)[number]["site"]
