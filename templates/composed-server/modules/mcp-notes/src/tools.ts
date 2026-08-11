import { z } from "zod"
import type { MCPServer } from "mcp-use"
import { createToolRegistrar } from "@miragon/mcp-toolkit-core/tools"
import type { NotesStore } from "./notes-store.js"

/**
 * Plain operations tools — JSON data *for the model* (render path 1 of 3).
 * Registered through the toolkit registrar, never raw `server.tool()`; only
 * widget tools (widget-tools.ts) use the raw registration path.
 */
export function registerTools(server: MCPServer, store: NotesStore): void {
  const register = createToolRegistrar(server, store)

  register({
    name: "notes_list_notes",
    category: "notes",
    description:
      "List the team's operations notes (title, text, tags, last update). Optional case-insensitive filter over title, text, and tags.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      query: z
        .string()
        .optional()
        .describe("Case-insensitive filter matched against title, text, and tags."),
    },
    handler: async (notes, args) => notes.list(args),
  })
}
