/**
 * The toolkit's bridge-aware host actions (`@miragon/mcp-toolkit-ui/app`):
 * `openLink` for external URLs, `showWidget`/`askAi` for in-widget navigation
 * and agent hand-off — for the `/widgets` barrel and the ask-ai/open-in-cockpit
 * components.
 */
export {
  useHostActions,
  buildShowWidgetIntent,
  type HostActions,
} from "@miragon/mcp-toolkit-ui/app"
