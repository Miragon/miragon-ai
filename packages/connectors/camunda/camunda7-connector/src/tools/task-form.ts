import { readTaskVariables, type Client, type VariableMap } from "@miragon-ai/camunda7-client"
import type { TaskFormField, TaskFormSchema } from "../view-models.js"
import { getTaskFormInput } from "@miragon-ai/camunda7-client/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import { getTask, getProcessDefinitionBpmn20Xml } from "@miragon-ai/camunda7-client/sdk"
import { extractEmbeddedFormFields } from "../lib/bpmn-task-form.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

interface TaskMeta {
  taskDefinitionKey?: string | null
  processDefinitionId?: string | null
  /** The task's own form (embedded/external/`camunda-forms:`), if any. */
  formKey?: string | null
}

export interface BuildTaskFormSchemaOptions {
  /** When provided, skips the redundant `getTask` round-trip. */
  task?: TaskMeta | null
  /**
   * Pre-fetched BPMN XML for the task's process definition. Pass `null`
   * to skip the BPMN fetch entirely. Leave `undefined` (default) to fetch
   * on demand.
   */
  bpmnXml?: string | null
}

export function registerTaskFormTools(register: Register) {
  register({
    name: "camunda7_get_task_form",
    category: "tasks",
    description:
      "Load the form schema for a user task from its embedded BPMN form definition (`<camunda:formData>`): fields " +
      "(type, required, readonly) pre-filled with current values. Never submit readonly fields. Without form fields, " +
      "fields is empty and formKey names the task's own form, if any.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...getTaskFormInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args): Promise<TaskFormSchema> => {
      const { taskId } = args as { taskId: string }
      return buildTaskFormSchema(client, taskId)
    }),
  })
}

/**
 * The form schema of a task. The task and its BPMN are REQUIRED lookups — a
 * failure (unknown task, no permission, engine down) throws instead of
 * passing for "no form": a caller would otherwise complete the task without
 * its form. Only the variable prefill degrades.
 */
export async function buildTaskFormSchema(
  client: Client,
  taskId: string,
  options: BuildTaskFormSchemaOptions = {},
): Promise<TaskFormSchema> {
  const taskMeta: TaskMeta = options.task ?? (await getTask({ client, path: { id: taskId } }))
  const taskDefinitionKey = taskMeta.taskDefinitionKey ?? null
  const formKey = taskMeta.formKey ? { formKey: taskMeta.formKey } : {}

  const bpmnXml =
    "bpmnXml" in options
      ? (options.bpmnXml ?? null)
      : await fetchBpmnXml(client, taskMeta.processDefinitionId ?? null)

  const fields =
    bpmnXml && taskDefinitionKey ? extractEmbeddedFormFields(bpmnXml, taskDefinitionKey) : []
  if (fields.length === 0) return { taskId, fields: [], ...formKey }

  // Populate defaultValue for all fields from current task variables so the
  // operator sees the actual values (especially important for readonly
  // fields). Optional: a failed read leaves the fields empty.
  const currentVars = await readTaskVariables(client, taskId).catch((): VariableMap => ({}))
  const filledFields: TaskFormField[] = fields.map((field) => {
    const varEntry = currentVars[field.name]
    if (varEntry !== undefined && field.defaultValue === undefined) {
      return { ...field, defaultValue: varEntry.value }
    }
    return field
  })

  return { taskId, fields: filledFields }
}

async function fetchBpmnXml(
  client: Client,
  processDefinitionId: string | null,
): Promise<string | null> {
  if (!processDefinitionId) return null
  const xmlResponse = await getProcessDefinitionBpmn20Xml({
    client,
    path: { id: processDefinitionId },
  })
  return xmlResponse.bpmn20Xml ?? null
}
