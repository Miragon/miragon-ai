import { useToolQuery } from "@miragon/mcp-toolkit-ui"
import {
  QueryFallback,
  TableEmptyState,
  TableSkeleton,
  Td,
  Th,
  WidgetHeader,
  WidgetShell,
  formatTimestamp,
} from "@miragon-ai/widget-shell/widgets"
import { NOTES_LIST_DATA } from "../tool-names.js"
import type { NotesListData } from "../notes-store.js"

/**
 * The notes list widget. Receives `data` from a `notes_show_notes` render (via
 * `adaptDataWidget` in `widgets/index.ts`); when mounted without data (e.g. a
 * host refresh), it self-fetches the app-only `notes_list_data` feed — never
 * the show tool, whose result the host would render as a second widget.
 */
export function NotesListWidget({ data: initialData }: { data: NotesListData | null }) {
  const query = useToolQuery<NotesListData>(
    ["notes:list"],
    NOTES_LIST_DATA,
    {},
    {
      enabled: !initialData,
    },
  )
  const data = initialData ?? query.data ?? null

  if (!data) {
    return (
      <WidgetShell>
        <WidgetHeader icon="🗒" iconTone="info" title="Team Notes" />
        <QueryFallback
          isError={query.isError}
          error={query.error}
          errorTitle="Failed to load notes"
          skeleton={<TableSkeleton />}
        />
      </WidgetShell>
    )
  }

  return (
    <WidgetShell>
      <WidgetHeader
        icon="🗒"
        iconTone="info"
        title={data.title}
        sub={`${data.notes.length} note(s)`}
      />
      {data.notes.length === 0 ? (
        <TableEmptyState>No notes match the current filter.</TableEmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>Note</Th>
                <Th>Tags</Th>
                <Th align="right">Updated</Th>
              </tr>
            </thead>
            <tbody>
              {data.notes.map((note) => (
                <tr key={note.id}>
                  <Td>
                    <div className="font-medium">{note.title}</div>
                    <div className="text-muted-foreground mt-0.5">{note.text}</div>
                  </Td>
                  <Td>{note.tags.join(", ")}</Td>
                  <Td align="right">{formatTimestamp(note.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WidgetShell>
  )
}
