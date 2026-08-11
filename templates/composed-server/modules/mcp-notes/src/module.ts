import { z } from "zod"
import type { AppPlugin } from "@miragon/mcp-toolkit-core"
import type { MCPServer } from "mcp-use"
import type { ProfileSource } from "@miragon-ai/widget-shell/server"
import { createPlugin } from "./plugin.js"

/**
 * Self-contained module definition for host apps: everything the app needs to
 * mount the notes module without knowing its config surface. Conforms
 * structurally to the app's `ModuleDefinition` port (`src/module-contract.ts`
 * in the server package) — no import of the app.
 */

const notesConfigSchema = z.object({
  title: z.string().default("Team Notes"),
})

/**
 * Cross-module resources the host app threads in (structural, app-owned).
 * This simple module uses none of them — the field documents what arrives:
 * modules that localize summaries or persist per-user settings consume
 * `profileStore` (compare the analytics module).
 */
interface NotesModuleShared {
  profileStore?: ProfileSource
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
