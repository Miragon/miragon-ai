import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import { createCamunda7Client, type Camunda7AuthType } from "@miragon-ai/client-camunda7"
import { registerTools } from "./tools/index.js"
import { registerWidgetTools } from "./widget-tools.js"
import { definition } from "./definition.js"

export interface Camunda7PluginConfig {
  baseUrl: string
  authType?: Camunda7AuthType
  username?: string
  password?: string
  token?: string
}

export function createPlugin(config: Camunda7PluginConfig): AppPlugin {
  const client = createCamunda7Client({
    baseUrl: config.baseUrl,
    authType: config.authType,
    username: config.username,
    password: config.password,
    token: config.token,
  })
  return {
    definition,
    appConfig: { client },
    registerTools: (server) => {
      registerTools(server, client)
    },
    registerWidgetTools: (server, resourceUri) => {
      registerWidgetTools(server, client, resourceUri)
    },
  }
}
