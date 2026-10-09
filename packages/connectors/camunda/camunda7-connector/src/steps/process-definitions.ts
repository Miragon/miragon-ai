import type { PipelineStepDefinition } from "@miragon/mcp-toolkit-core"
import { buildProcessListData } from "../data/cockpit-data.js"
import type { Camunda7StepAppConfig } from "../lib/resolve-engine.js"
import { ENGINE_KEY, stepEngine, stringKey } from "./shared.js"

/**
 * The deployed process definitions (latest version each, first page, exact
 * total) — adapter over {@link buildProcessListData}, the builder of
 * `camunda7_show_process_list`. Consumed by `camunda7:process-list`.
 */
export const loadProcessDefinitionsStep: PipelineStepDefinition<Camunda7StepAppConfig> = {
  id: "camunda7:load-process-definitions",
  description:
    "Deployed process definitions (latest version of each, first page, exact total). Powers camunda7:process-list.",
  dataType: "camunda7:processDefinitionList",
  requires: [],
  optionalKeys: [
    ENGINE_KEY,
    {
      key: "camunda7:processDefinitionKey",
      description: "Restrict the list to this exact definition key.",
    },
    {
      key: "camunda7:nameLike",
      description: "Filter by definition name (substring; % wildcards allowed).",
    },
  ],
  produces: ["camunda7:definitions"],
  execute: async (context, appConfig) => {
    const { client, engineId } = await stepEngine(context, appConfig)
    const data = await buildProcessListData(client, engineId, {
      processDefinitionKey: stringKey(context, "camunda7:processDefinitionKey"),
      nameLike: stringKey(context, "camunda7:nameLike"),
    })
    return {
      data,
      keys: { "camunda7:definitions": data.definitions },
      _app: "camunda7",
      _step: "load-process-definitions",
    }
  },
}
