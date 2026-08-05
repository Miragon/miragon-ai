import { z } from "zod"
import type { MCPServer } from "mcp-use/server"
import { APP_ONLY_META, uiMeta as buildUiMeta } from "@miragon/mcp-toolkit-core"
import {
  buildDataFeedResult,
  buildSingleWidgetView,
  withToolErrors,
} from "@miragon-ai/widget-shell/server"
import { NOTES_LIST_DATA } from "./tool-names.js"
import type { NotesStore } from "./notes-store.js"

/**
 * App-only marker for the internal `*_data` feed — same dual contract as the
 * camunda7/analytics modules: SEP-1865 hosts hide the tool from the model,
 * `openai/widgetAccessible` lets Apps-SDK hosts accept the in-widget callTool.
 */
const appOnlyMeta = { ...APP_ONLY_META, "openai/widgetAccessible": true }

/** Inputs shared by `notes_show_notes` and its `notes_list_data` feed. */
const notesInputShape = {
  query: z
    .string()
    .optional()
    .describe("Case-insensitive filter matched against title, text, and tags."),
}

export function registerWidgetTools(
  server: MCPServer,
  store: NotesStore,
  resourceUri: string,
  title: string,
) {
  const uiMeta = buildUiMeta({ resourceUri })

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
      schema: z.object(notesInputShape),
      _meta: uiMeta,
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
      schema: z.object(notesInputShape),
      _meta: appOnlyMeta,
    },
    withToolErrors(async (args) => buildDataFeedResult({ title, notes: store.list(args) })),
  )
}
