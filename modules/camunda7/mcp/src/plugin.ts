import type { ModulePlugin } from "@automation-mcp/core"
import { createCamunda7Client, type Camunda7AuthType } from "@automation-mcp/client-camunda7"
import { registerTools } from "./tools/index.js"
import { registerWidgetTools } from "./widget-tools.js"

export interface Camunda7PluginConfig {
  baseUrl: string
  authType?: Camunda7AuthType
  username?: string
  password?: string
  token?: string
}

export function createPlugin(config: Camunda7PluginConfig): ModulePlugin {
  const client = createCamunda7Client({
    baseUrl: config.baseUrl,
    authType: config.authType,
    username: config.username,
    password: config.password,
    token: config.token,
  })
  return {
    name: "camunda7",
    version: "0.1.0",
    description:
      "Camunda 7 / CIB Seven BPM operations: process definitions, instances, tasks, external tasks, incidents, jobs, history.",
    registerTools: (server) => {
      registerTools(server, client)
    },
    registerWidgetTools: (server, resourceUri) => {
      registerWidgetTools(server, client, resourceUri)
    },
  }
}
