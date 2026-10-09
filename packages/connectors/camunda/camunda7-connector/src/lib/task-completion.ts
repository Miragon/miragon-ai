/**
 * Completing a user task — the ONE place `camunda7_complete_task` picks its
 * engine endpoint (the source scan in `engine-contract.test.ts` keeps the raw
 * SDK calls here). The three endpoints differ in ways a caller cannot see:
 *
 * - `/task/{id}/submit-form` is the only one that runs the task's
 *   `<camunda:formData>` fields: required/readonly/type validation and the
 *   type conversion. But it also writes every field's BPMN `defaultValue`
 *   over the current value when the field is not submitted, and it RESOLVES
 *   a delegated task instead of completing it (`SubmitTaskFormCmd`).
 * - `/task/{id}/complete` validates nothing and leaves omitted variables as
 *   they are; it completes a delegated task outright, skipping its owner.
 * - `/task/{id}/resolve` hands a delegated task back to its owner.
 *
 * So: a task WITH form fields is submitted as its form, with the current value
 * of every omitted field the engine would otherwise reset; a task without
 * form fields completes through `/complete`; and a delegated task
 * (`delegationState` PENDING) is resolved — through the form when it has one —
 * and reported as such, never as completed.
 */
import {
  readTaskVariables,
  toEngineVariables,
  type Client,
  type EngineVariableInput,
  type VariableMap,
} from "@miragon-ai/camunda7-client"
import {
  complete,
  getProcessDefinitionBpmn20Xml,
  getTask,
  resolve,
  submit,
} from "@miragon-ai/camunda7-client/sdk"
import { formFieldSubmitRules, type FormFieldSubmitRule } from "./bpmn-task-form.js"

export type TaskCompletion =
  | { success: true; taskId: string; outcome: "completed" }
  /** A delegated task went back to its owner (now its assignee) and stays open. */
  | { success: true; taskId: string; outcome: "resolved"; assignee: string | null }

interface TaskRow {
  taskDefinitionKey?: string | null
  processDefinitionId?: string | null
  delegationState?: string | null
  owner?: string | null
}

/**
 * The submit rules of the task's form fields; `[]` for a task without a BPMN
 * user-task form. The BPMN read is REQUIRED: guessing "no form" would complete
 * a form task unvalidated, guessing "form" would reset its defaults.
 */
async function formRules(client: Client, task: TaskRow): Promise<FormFieldSubmitRule[]> {
  if (!task.processDefinitionId || !task.taskDefinitionKey) return []
  const xml = await getProcessDefinitionBpmn20Xml({
    client,
    path: { id: task.processDefinitionId },
  })
  return xml.bpmn20Xml ? formFieldSubmitRules(xml.bpmn20Xml, task.taskDefinitionKey) : []
}

/**
 * The current values of the omitted form fields the engine would reset to
 * their BPMN default — sent back unchanged, so an omitted field keeps its
 * value as it did through `/complete`. Read raw (`deserializeValues=false`):
 * the serialized value + `valueInfo` is exactly the shape a write takes. A
 * field whose variable does not exist yet gets its default (the form's own
 * initialization). An engine-readonly field cannot be submitted, so the
 * engine still applies ITS default — the form's own rule, as in Tasklist.
 */
async function omittedValuesToKeep(
  client: Client,
  taskId: string,
  rules: FormFieldSubmitRule[],
  submitted: VariableMap,
): Promise<VariableMap> {
  const atRisk = rules.filter(
    (rule) => rule.hasDefault && !rule.engineReadonly && !Object.hasOwn(submitted, rule.name),
  )
  if (atRisk.length === 0) return {}
  // Required: without the current values the submit would reset them silently.
  const current = await readTaskVariables(client, taskId)
  return Object.fromEntries(
    atRisk.flatMap(({ name }) => {
      const variable = current[name]
      return variable && variable.value !== null && variable.value !== undefined
        ? [[name, variable]]
        : []
    }),
  )
}

/** The body's `variables`, omitted when there are none (as before). */
function variablesBody(variables: VariableMap) {
  return { variables: Object.keys(variables).length > 0 ? variables : undefined }
}

export async function completeUserTask(
  client: Client,
  taskId: string,
  variables: Record<string, EngineVariableInput> | undefined,
): Promise<TaskCompletion> {
  // Converted (and refused) before any request: a bad value never half-runs.
  const submitted: VariableMap = toEngineVariables(variables) ?? {}
  const task: TaskRow = await getTask({ client, path: { id: taskId } })
  const delegated = task.delegationState === "PENDING"
  const rules = await formRules(client, task)
  const path = { id: taskId }

  if (rules.length > 0) {
    const kept = await omittedValuesToKeep(client, taskId, rules, submitted)
    await submit({ client, path, body: variablesBody({ ...kept, ...submitted }) })
  } else if (delegated) {
    await resolve({ client, path, body: variablesBody(submitted) })
  } else {
    await complete({ client, path, body: variablesBody(submitted) })
  }

  return delegated
    ? { success: true, taskId, outcome: "resolved", assignee: task.owner ?? null }
    : { success: true, taskId, outcome: "completed" }
}
