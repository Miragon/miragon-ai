import { useToolQuery, WidgetHeader } from "@miragon/mcp-toolkit-ui"
import {
  ListTable,
  QueryFallback,
  TableEmptyState,
  TableSkeleton,
  Td,
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
        <WidgetHeader title="Team Notes" />
        <QueryFallback
          isError={query.isError}
          error={query.error}
          errorTitle="Failed to load notes"
          onRetry={() => void query.refetch()}
          skeleton={<TableSkeleton />}
        />
      </WidgetShell>
    )
  }

  return (
    <WidgetShell>
      <WidgetHeader title={data.title} sub={`${data.notes.length} note(s)`} />
      {data.notes.length === 0 ? (
        <TableEmptyState>No notes match the current filter.</TableEmptyState>
      ) : (
        <ListTable
          ariaLabel="Notes"
          columns={[
            { label: "Note" },
            // Column priority: the tags hide while the table is narrow.
            { label: "Tags", hideBelow: "sm" },
            { label: "Updated", align: "right" },
          ]}
        >
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
        </ListTable>
      )}
    </WidgetShell>
  )
}
