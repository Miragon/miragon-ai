/**
 * The dual-mode view-data hook (`@miragon-ai/widget-shell/widgets`):
 * standalone `show_*` widgets hand their tool result in as `initialData` —
 * the SEED of the feed query, which stays live so a write's refetch reaches
 * them too — while inside the cockpit a widget self-fetches `tool` under
 * `key` (siblings dedupe to one call).
 */
export { useViewData, type ViewDataResult } from "@miragon-ai/widget-shell/widgets"
