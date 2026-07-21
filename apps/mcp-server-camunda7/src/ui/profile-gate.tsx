import { type ReactNode } from "react"
import { useWidget } from "mcp-use/react"
import { AppQueryProvider, LocaleProvider, useToolQuery } from "@miragon/mcp-toolkit-ui"
import { useApplyTheme } from "@miragon-ai/mcp-camunda7/widgets"

/**
 * Stable name of the camunda7 user-profile feed (app-only `*_data` tool).
 * Hardcoded so the host bundle doesn't take a build-time dependency on the
 * module's tool-name constants — the feed name is part of the module contract.
 */
const PROFILE_DATA_TOOL = "camunda7_user_profile_data"

interface ProfileFeed {
  profile?: { language?: string; theme?: string }
}

/**
 * Resolves the active user profile once at the app root and (1) provides its
 * locale to the whole tree via `<LocaleProvider>` and (2) applies its theme
 * document-wide. So every widget — the cockpit, the fleet view, and standalone
 * `show_*` renders — is localized and themed with zero per-widget wiring.
 *
 * `useToolQuery` needs a `callTool` from an `AppQueryProvider`; we thread the
 * one from `useWidget()` (the host bridge) here. `McpAppView` sets up its own
 * `AppQueryProvider` for its widgets — both share the toolkit's singleton query
 * client, so this nests cleanly. Defaults to English / system when the feed is
 * unavailable (e.g. the camunda7 module is disabled).
 */
export function ProfileGate({ children }: { children: ReactNode }) {
  const { callTool } = useWidget()
  // Adapt the host bridge's `(name, Record<string, unknown>)` callTool to the
  // provider's `(name, object)` signature (a plain `{}` isn't a Record).
  const callToolFn = (name: string, args: object) => callTool(name, args as Record<string, unknown>)
  return (
    <AppQueryProvider callTool={callToolFn}>
      <ProfileGateInner>{children}</ProfileGateInner>
    </AppQueryProvider>
  )
}

function ProfileGateInner({ children }: { children: ReactNode }) {
  const { data } = useToolQuery<ProfileFeed>(["profile-gate"], PROFILE_DATA_TOOL, {})
  const profile = data?.profile
  useApplyTheme(profile?.theme)
  return <LocaleProvider locale={profile?.language ?? "en"}>{children}</LocaleProvider>
}
