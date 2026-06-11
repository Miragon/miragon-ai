/**
 * Re-exports the toolkit's bridge-aware host actions (`@miragon/mcp-toolkit-ui/app`,
 * 0.4.0): `openLink` for external URLs, `showWidget`/`askAi` for in-widget
 * navigation and agent hand-off. Kept as a local module so the `/widgets` barrel
 * and the repo-specific ask-ai/open-in-cockpit components keep a stable path.
 */
export {
  useHostActions,
  buildShowWidgetIntent,
  type HostActions,
} from "@miragon/mcp-toolkit-ui/app"
