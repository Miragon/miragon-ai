import { z } from "zod"
import type { MCPServer } from "mcp-use"
import { appsSdkMeta, viewResourceUri } from "@miragon/mcp-toolkit-core"
import {
  buildDataFeedResult,
  buildSingleWidgetView,
  withToolErrors,
} from "@miragon-ai/widget-shell/server"
import { NOTES_LIST_DATA } from "./tool-names.js"
import type { NotesStore } from "./notes-store.js"

/**
 * Binding for a model-visible `*_show_*` tool — same house pattern as the
 * camunda7/analytics modules (module-local on purpose: modules are peers).
 * The view name IS the tool name: mcp-use derives the entire MCP Apps half of
 * the wire contract (`_meta.ui.resourceUri`, flat `ui/resourceUri`, resource
 * CSP) from the first-class `view` binding — never stamp `ui` keys by hand,
 * mcp-use overwrites that namespace on `tools/list`. What mcp-use does NOT
 * derive is the OpenAI Apps SDK half (`openai/*`): `appsSdkMeta` builds it,
 * pointing `openai/outputTemplate` at the same `ui://views/<name>.html`
 * resource. The `outputSchema` is required by mcp-use for any view-bound
 * tool; `passthrough` matches the free-form `structuredContent` the
 * widget-shell view builders return.
 */
function showToolBinding(name: string, title: string) {
  return {
    view: { name },
    outputSchema: z.object({}).passthrough(),
    _meta: appsSdkMeta({ resourceUri: viewResourceUri(name), title }),
  }
}

/**
 * Marker for the internal `*_data` feed: mcp-use's native `visibility: "app"`
 * hides the tool from the model (SEP-1865), while the hand-stamped
 * `openai/widgetAccessible` lets Apps SDK hosts accept the in-widget
 * `callTool`. Deliberately no `view` binding — the feed must return JSON,
 * not render UI.
 */
const appOnly = {
  visibility: "app" as const,
  _meta: { "openai/widgetAccessible": true },
}

/** Inputs shared by `notes_show_notes` and its `notes_list_data` feed. */
const notesInputShape = {
  query: z
    .string()
    .optional()
    .describe("Case-insensitive filter matched against title, text, and tags."),
}

export function registerWidgetTools(server: MCPServer, store: NotesStore, title: string) {
  // Render path 2 of 3: renders the widget for the user AND returns a short
  // summary for the model. The `_show_` naming is load-bearing — the server's
  // widget-contract e2e test asserts the widget `_meta` on it by name.
  server.tool(
    {
      name: "notes_show_notes",
      title: "Team Notes",
      description:
        "Show the team's operations notes as an interactive list. Optional case-insensitive filter over title, text, and tags.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: z.object(notesInputShape),
      ...showToolBinding("notes_show_notes", "Team Notes"),
    },
    withToolErrors(async (args) => {
      const notes = store.list(args)
      return buildSingleWidgetView({
        widget: "notes:list",
        app: "notes",
        dataType: "notes:list",
        data: { title, notes },
        title: "Team Notes",
        summary:
          `Showing ${notes.length} team note(s)` +
          `${args.query ? ` matching "${args.query}"` : ""}. ` +
          "Fetch the raw list with notes_list_notes.",
      })
    }),
  )

  // Render path 3 of 3: the app-only `*_data` feed for the widget's own
  // refresh/self-fetch. The `_data` suffix is load-bearing — the e2e test
  // asserts app-only visibility on it by name.
  server.tool(
    {
      name: NOTES_LIST_DATA,
      title: "Notes list data (internal)",
      description:
        "Internal JSON feed (no UI) for the notes widget's self-fetch. Prefer notes_show_notes.",
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: z.object(notesInputShape),
      ...appOnly,
    },
    withToolErrors(async (args) => buildDataFeedResult({ title, notes: store.list(args) })),
  )
}
