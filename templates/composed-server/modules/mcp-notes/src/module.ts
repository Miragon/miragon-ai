import { z } from "zod"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"
import type { ProfileSource } from "@miragon-ai/widget-shell/server"
import { createNotesStore } from "./notes-store.js"
import { registerTools } from "./tools.js"
import { registerWidgetTools } from "./widget-tools.js"
import { definition } from "./definition.js"

/**
 * Self-contained module definition: everything the server needs to mount the
 * notes module. Conforms structurally to the server's `ModuleDefinition` port
 * (`server/src/setup.ts`) — no import of the server.
 */

const notesConfigSchema = z.object({
  title: z.string().default("Team Notes"),
})

export interface NotesPluginConfig {
  /** Heading shown in the notes widget. */
  title: string
}

/**
 * Cross-module resources the server threads in. This simple module uses none
 * of them; modules that persist per-user settings consume `profileStore`
 * (compare the analytics module).
 */
interface NotesModuleShared {
  profileStore?: ProfileSource
}

/** Constructs the data source once and hands it to both tool registrations. */
export function createPlugin(config: NotesPluginConfig): AppPlugin<MCPServer> {
  const store = createNotesStore()
  return {
    definition,
    appConfig: { store },
    registerTools: (server) => {
      registerTools(server, store)
    },
    registerWidgetTools: (server) => {
      registerWidgetTools(server, store, config.title)
    },
  }
}

export const notesModule = {
  name: "notes",

  /** Pure env → raw-config mapping; validation happens in `createPlugin`. */
  configFromEnv(env: NodeJS.ProcessEnv): Record<string, unknown> {
    return { title: env.NOTES_TITLE?.trim() || undefined }
  },

  /** This module's slice of the app's unknown-env-var typo warner. */
  knownEnvVars: ["NOTES_TITLE"] as const,

  // No toolset variants — the app warns and exposes all tools when a
  // `notes:<toolset>` suffix appears in MCP_ACTIVE_MODULES.
  supportsToolsets: false,

  createPlugin(config: Record<string, unknown>, _shared: NotesModuleShared): AppPlugin<MCPServer> {
    return createPlugin(notesConfigSchema.parse(config))
  },
}
