/**
 * Re-exports the toolkit's dual-mode view-data hook (`@miragon/mcp-toolkit-ui/hooks`,
 * 0.4.0): standalone `show_*` widgets receive their data via `initialData`, while
 * inside the cockpit a widget self-fetches `tool` under `key` (siblings dedupe to
 * one call). Kept as a local module so the eight cockpit widgets keep a stable path.
 */
export { useViewData, type ViewDataResult } from "@miragon/mcp-toolkit-ui/hooks"
