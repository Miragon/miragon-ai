import { adaptDataWidget, type DescribeForModel } from "@miragon-ai/widget-shell/ui"
import type { WidgetComponent } from "@miragon/mcp-toolkit-ui/app"
import { NotesListWidget } from "./notes-list.js"
import type { NotesListData } from "../notes-store.js"

/**
 * Component map for the host bundle — link 1 of the four-link widget chain.
 * The host app spreads this into its `widget-registry.ts` (link 3); the ids
 * must match `definition.ts` (link 2, guarded by catalogue-sync.test.ts).
 */

// Model-context description so the model always knows what the user is
// looking at — the house pattern from the camunda7/analytics modules.
const describeNotes: DescribeForModel<NotesListData> = (data) =>
  `Viewing the "${data.title}" notes list: ${data.notes.length} note(s). ` +
  "Fetch the raw list with notes_list_notes."

export const notesWidgets: Record<string, WidgetComponent> = {
  "notes:list": adaptDataWidget(NotesListWidget, "notes:list", describeNotes),
}
