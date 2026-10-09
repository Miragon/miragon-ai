/**
 * The toolkit's dual-mode view-data hook (`@miragon/mcp-toolkit-ui/hooks`):
 * standalone `show_*` widgets receive their data via `initialData`, while
 * inside the cockpit a widget self-fetches `tool` under `key` (siblings dedupe
 * to one call).
 */
export { useViewData, type ViewDataResult } from "@miragon/mcp-toolkit-ui/hooks"
