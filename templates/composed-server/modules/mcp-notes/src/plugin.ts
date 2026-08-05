import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use/server"
import { createNotesStore } from "./notes-store.js"
import { registerTools } from "./tools.js"
import { registerWidgetTools } from "./widget-tools.js"
import { definition } from "./definition.js"

export interface NotesPluginConfig {
  /** Heading shown in the notes widget. */
  title: string
}

export function createPlugin(config: NotesPluginConfig): AppPlugin<MCPServer> {
  const store = createNotesStore()
  return {
    definition,
    appConfig: { store },
    registerTools: (server) => {
      registerTools(server, store)
    },
    registerWidgetTools: (server, resourceUri) => {
      registerWidgetTools(server, store, resourceUri, config.title)
    },
  }
}
