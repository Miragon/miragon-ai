import { shortId } from "@miragon/pulse-widget-shell/widgets"
import type { T } from "../../messages/use-t.js"
import type { TaskCompletion } from "./complete-task.js"
import type { TargetLine, WriteFeedback } from "./engine-action.js"

/**
 * An instance as a toast names it: its business key when it has one (what
 * people search for), else its short id ("5f0ce78e…").
 */
export function instanceName(id: string, businessKey?: string | null): string {
  return businessKey || shortId(id)
}

/**
 * An instance as a confirmation names it, the label every view shows
 * (`InstanceLabel`, #322 U13): its business key first, then its short id —
 * never a bare UUID that wraps over two lines.
 */
export function instanceTargetLines(
  t: T,
  id: string,
  businessKey?: string | null,
): [TargetLine, ...TargetLine[]] {
  const instance: TargetLine = [t("confirmDialog.instance"), shortId(id)]
  return businessKey ? [[t("confirmDialog.businessKey"), businessKey], instance] : [instance]
}

/**
 * The toasts of every widget write (U9), one per write and in one place, so
 * the same write says the same thing on every surface: what happened to
 * which object.
 */
export const writeFeedback = {
  jobRetry: (t: T, instance: string): WriteFeedback<unknown> => ({
    success: t("feedback.jobRetried", { instance }),
    failure: t("feedback.jobRetryFailed", { instance }),
  }),
  externalTaskRetry: (t: T, instance: string): WriteFeedback<unknown> => ({
    success: t("feedback.externalTaskRetried", { instance }),
    failure: t("feedback.externalTaskRetryFailed", { instance }),
  }),
  resolve: (t: T, instance: string): WriteFeedback<unknown> => ({
    success: t("feedback.incidentResolved", { instance }),
    failure: t("feedback.incidentResolveFailed", { instance }),
  }),
  cancel: (t: T, instance: string): WriteFeedback<unknown> => ({
    success: t("feedback.instanceCancelled", { instance }),
    failure: t("feedback.instanceCancelFailed", { instance }),
  }),
  suspension: (t: T, instance: string, suspend: boolean): WriteFeedback<unknown> =>
    suspend
      ? {
          success: t("feedback.instanceSuspended", { instance }),
          failure: t("feedback.instanceSuspendFailed", { instance }),
        }
      : {
          success: t("feedback.instanceActivated", { instance }),
          failure: t("feedback.instanceActivateFailed", { instance }),
        },
  variable: (t: T, name: string): WriteFeedback<unknown> => ({
    success: t("feedback.variableSaved", { name }),
    failure: t("feedback.variableSaveFailed", { name }),
  }),
  /** A delegated task is resolved back to its owner, not completed: the result says which. */
  completeTask: (t: T, name: string): WriteFeedback<TaskCompletion> => ({
    success: (result) =>
      result?.outcome === "resolved" && result.assignee
        ? t("feedback.taskReturned", { name, owner: result.assignee })
        : t("feedback.taskCompleted", { name }),
    failure: t("feedback.taskCompleteFailed", { name }),
  }),
  settings: (t: T): WriteFeedback<unknown> => ({
    success: t("feedback.settingsSaved"),
    failure: t("feedback.settingsSaveFailed"),
  }),
}
