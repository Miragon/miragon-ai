import { useCallback } from "react"
import { useWidget } from "mcp-use/react"

export interface HostActions {
  /**
   * Open an external URL in a new browser tab via the host bridge
   * (`bridge.openLink` / `window.openai.openExternal`). Works inside the
   * sandboxed iframe where raw `window.open` is blocked. Falls back to
   * `window.open` only when no MCP host bridge is available (dev preview).
   */
  openLink: (url: string) => void
  /**
   * Ask the host to render another tool's widget by sending a follow-up
   * user message into the conversation (`bridge.sendMessage` /
   * `window.openai.sendFollowUpMessage`). The agent interprets the prompt
   * and invokes the matching tool, whose widget then appears as the next
   * chat turn — the proper MCP-Apps pattern for in-widget navigation.
   *
   * The prompt should be natural language and include enough hints
   * (preferably the tool name in parentheses) for the agent to pick the
   * right tool unambiguously.
   */
  showWidget: (prompt: string) => void
}

/**
 * Builds the natural-language intent string passed to {@link HostActions.showWidget}.
 * The host agent reads the trailing `(use <toolName>)` hint to pick the right
 * tool unambiguously. Centralised so every in-widget navigation handoff phrases
 * the hint identically (and a tool rename only has to flow through the imported
 * `CAMUNDA7_SHOW_*` constant).
 *
 * @example host.showWidget(buildShowWidgetIntent(CAMUNDA7_SHOW_PROCESS_DETAIL, `Show the process detail for \`${key}\``))
 */
export function buildShowWidgetIntent(toolName: string, description: string): string {
  return `${description} (use ${toolName})`
}

/**
 * Bridge-aware host actions for widgets. Replaces the older
 * `useOpenExternal` (which used raw `window.open` and was blocked in the
 * MCP host iframe). Use `openLink` for external URLs and `showWidget` to
 * navigate to another tool's widget.
 */
export function useHostActions(): HostActions {
  const widget = useWidget()
  const { openExternal, sendFollowUpMessage } = widget

  const openLink = useCallback(
    (url: string) => {
      try {
        openExternal(url)
      } catch {
        // No host bridge (e.g. local dev preview) — fall back to window.open
        window.open(url, "_blank", "noopener")
      }
    },
    [openExternal],
  )

  const showWidget = useCallback(
    (prompt: string) => {
      void sendFollowUpMessage(prompt).catch((err: unknown) => {
        console.warn("Failed to send follow-up message:", err)
      })
    },
    [sendFollowUpMessage],
  )

  return { openLink, showWidget }
}
