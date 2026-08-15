import { useCallback, useEffect, type ReactNode } from "react"
import { AppQueryProvider, LocaleProvider, useToolQuery } from "@miragon/mcp-toolkit-ui"
import { useHostBridge } from "@miragon/mcp-toolkit-ui/app"
import { useApplyTheme } from "./use-apply-theme.js"

interface ProfileFeed {
  profile?: { language?: string; theme?: string }
}

export interface ProfileGateProps {
  /**
   * Name of the app-only user-profile data feed (e.g.
   * `camunda7_user_profile_data`). Hosts pass the string literal — the feed
   * name is part of the module contract, so the host bundle takes no
   * build-time dependency on the module's tool-name constants.
   */
  profileTool: string
  /**
   * Query key for the profile fetch. Defaults to `<module>:profile-gate`
   * (module = the tool name up to the first `_`) ON PURPOSE: module-prefix
   * cache invalidation (e.g. camunda7's refreshCockpitData, which invalidates
   * `camunda7:*` keys) MUST refetch the gate after a profile save — otherwise
   * a saved language/theme change only shows up on the next widget render
   * instead of flipping live.
   */
  queryKey?: readonly string[]
  children: ReactNode
}

/**
 * Resolves the active user profile once at the app root, provides its locale
 * to the whole tree, and applies its theme document-wide — so every widget is
 * localized and themed with zero per-widget wiring. Defaults to English /
 * system theme when the feed is unavailable (e.g. the owning module is
 * disabled).
 */
export function ProfileGate({ profileTool, queryKey, children }: ProfileGateProps) {
  const { callTool } = useHostBridge()
  // Adapt the host bridge's `Record<string, unknown>` args to the provider's
  // `object` signature.
  const callToolFn = useCallback(
    (name: string, args: object) => callTool(name, args as Record<string, unknown>),
    [callTool],
  )
  return (
    <AppQueryProvider callTool={callToolFn}>
      <ProfileGateInner profileTool={profileTool} queryKey={queryKey}>
        {children}
      </ProfileGateInner>
    </AppQueryProvider>
  )
}

function ProfileGateInner({
  profileTool,
  queryKey,
  children,
}: Pick<ProfileGateProps, "profileTool" | "queryKey"> & { children: ReactNode }) {
  const key = queryKey ?? [`${profileTool.split("_")[0]}:profile-gate`]
  const { data } = useToolQuery<ProfileFeed>([...key], profileTool, {})
  const profile = data?.profile
  const language = profile?.language ?? "en"
  useApplyTheme(profile?.theme)
  // Keep the document language in sync with the profile locale — the iframe
  // document hardcodes `lang="en"`, which misleads screen readers otherwise.
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])
  return <LocaleProvider locale={language}>{children}</LocaleProvider>
}
