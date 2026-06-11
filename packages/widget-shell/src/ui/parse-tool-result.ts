/**
 * Re-exports the toolkit's structured-first result parsers. As of
 * `@miragon/mcp-toolkit-ui` 0.4.0 these are structured-first too (the reason the
 * local copies existed — the toolkit being text-first — is gone), so the local
 * implementations were redundant. Kept as a local module so in-package importers
 * and the `/widgets` barrel keep a stable path.
 */
export { parseToolResult, parseViewToolResult } from "@miragon/mcp-toolkit-ui"
