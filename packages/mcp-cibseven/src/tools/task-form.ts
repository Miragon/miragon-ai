import type { Client, TaskFormField, TaskFormSchema } from "@miragon-ai/client-cibseven"
import { getTaskFormInput } from "@miragon-ai/client-cibseven/schemas"
import type { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import {
  getTask,
  getTaskVariables,
  getProcessDefinitionBpmn20Xml,
} from "@miragon-ai/client-cibseven/generated/sdk.gen"
import { extractEmbeddedFormFields } from "../lib/bpmn-task-form.js"
import type { EngineRegistry } from "../lib/resolve-engine.js"
import { engineParamShape, withEngine } from "../lib/with-engine.js"

type Register = ReturnType<typeof createToolRegistrar<EngineRegistry>>

interface TaskMeta {
  taskDefinitionKey?: string | null
  processDefinitionId?: string | null
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
    description:
      "Load the form schema for a user task from its embedded BPMN form definition (`<camunda:formData>`). Returns form fields with current variable values pre-filled. Fields marked readonly are for context only and will not be submitted. Returns an empty fields array when no form is defined on the task.",
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { ...getTaskFormInput.shape, ...engineParamShape },
    handler: withEngine(async (client, args): Promise<TaskFormSchema> => {
      const { taskId } = args as { taskId: string }
      return buildTaskFormSchema(client, taskId)
    }),
  })
}

export async function buildTaskFormSchema(
  client: Client,
  taskId: string,
  options: BuildTaskFormSchemaOptions = {},
): Promise<TaskFormSchema> {
  const taskMeta = options.task ?? (await fetchTaskMeta(client, taskId))
  const taskDefinitionKey = taskMeta?.taskDefinitionKey ?? null
  const processDefinitionId = taskMeta?.processDefinitionId ?? null

  const bpmnXml =
    "bpmnXml" in options
      ? (options.bpmnXml ?? null)
      : await fetchBpmnXml(client, processDefinitionId)

  if (!bpmnXml || !taskDefinitionKey) {
    return { taskId, fields: [] }
  }

  const fields = extractEmbeddedFormFields(bpmnXml, taskDefinitionKey)

  if (fields.length === 0) {
    return { taskId, fields: [] }
  }

  // Populate defaultValue for all fields from current task variables so the
  // operator sees the actual values (especially important for readonly fields).
  const currentVars = await fetchTaskVariables(client, taskId)
  const filledFields: TaskFormField[] = fields.map((field) => {
    const varEntry = currentVars[field.name]
    if (varEntry !== undefined && field.defaultValue === undefined) {
      return { ...field, defaultValue: varEntry.value }
    }
    return field
  })

  return { taskId, fields: filledFields }
}

async function fetchTaskMeta(client: Client, taskId: string): Promise<TaskMeta | null> {
  const result = (await getTask({ client, path: { id: taskId } }).catch(
    () => null,
  )) as unknown as TaskMeta | null
  return result
}

async function fetchBpmnXml(
  client: Client,
  processDefinitionId: string | null,
): Promise<string | null> {
  if (!processDefinitionId) return null
  const xmlResponse = (await getProcessDefinitionBpmn20Xml({
    client,
    path: { id: processDefinitionId },
  }).catch(() => null)) as { bpmn20Xml?: string } | null
  return xmlResponse?.bpmn20Xml ?? null
}

async function fetchTaskVariables(
  client: Client,
  taskId: string,
): Promise<Record<string, { value: unknown; type?: string }>> {
  const result = (await getTaskVariables({ client, path: { id: taskId } }).catch(
    () => ({}),
  )) as Record<string, { value: unknown; type?: string }>
  return result
}
