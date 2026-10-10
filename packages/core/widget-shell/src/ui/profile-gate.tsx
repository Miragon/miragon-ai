import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { AppQueryProvider, LocaleProvider, Skeleton, useToolQuery } from "@miragon/mcp-toolkit-ui"
import { useHostBridge } from "@miragon/mcp-toolkit-ui/app"
import {
  getFormatLocale,
  setFormatLocale,
  subscribeFormatLocale,
  type FormatLocale,
} from "./format.js"
import { formattingLocale, resolveLanguage, validTimeZone } from "./host-context.js"
import { kitLabels } from "./kit-labels.js"
import { useShellHost } from "./shell-host.js"
import { useApplyTheme } from "./use-apply-theme.js"

interface ProfileFeed {
  profile?: { language?: string; theme?: string }
}

/** How long the first paint waits for the profile before it renders from the host context alone. */
const PROFILE_WAIT_MS = 1_500

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
  /**
   * The first paint's bound wait for the profile (ms, default
   * {@link PROFILE_WAIT_MS}): a feed that neither answers nor fails in time
   * (a slow store, react-query's retries on a disabled module) renders from
   * the host context instead of holding the view.
   */
  profileWaitMs?: number
  children: ReactNode
}

/**
 * Resolves the active user profile once at the app root and turns it, with
 * the host context ({@link useShellHost}), into the view's ONE effective
 * locale and theme — so every widget is localized and themed with zero
 * per-widget wiring:
 *  - language: explicit profile choice > `hostContext.locale` > English;
 *  - theme: explicit profile choice > `hostContext.theme` > the OS (applied
 *    document-wide by {@link useApplyTheme});
 *  - the shared date formatters follow the same locale and the host's time zone.
 * The first paint waits for the profile (bounded by `profileWaitMs`) behind a
 * neutral skeleton, so a German or dark profile never flashes English or the
 * OS theme first; a feed that fails (e.g. the owning module is disabled)
 * releases the gate at once with the host-derived values.
 */
export function ProfileGate({ profileTool, queryKey, profileWaitMs, children }: ProfileGateProps) {
  const { callTool } = useHostBridge()
  // Adapt the host bridge's `Record<string, unknown>` args to the provider's
  // `object` signature.
  const callToolFn = useCallback(
    (name: string, args: object) => callTool(name, args as Record<string, unknown>),
    [callTool],
  )
  return (
    <AppQueryProvider callTool={callToolFn}>
      <ProfileGateInner profileTool={profileTool} queryKey={queryKey} profileWaitMs={profileWaitMs}>
        {children}
      </ProfileGateInner>
    </AppQueryProvider>
  )
}

/** True once `ms` elapsed since mount. */
function useElapsed(ms: number): boolean {
  const [elapsed, setElapsed] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setElapsed(true), ms)
    return () => clearTimeout(id)
  }, [ms])
  return elapsed
}

function ProfileGateInner({
  profileTool,
  queryKey,
  profileWaitMs = PROFILE_WAIT_MS,
  children,
}: Omit<ProfileGateProps, "children"> & { children: ReactNode }) {
  const host = useShellHost()
  const key = queryKey ?? [`${profileTool.split("_")[0]}:profile-gate`]
  const { data, isPending } = useToolQuery<ProfileFeed>([...key], profileTool, {})
  const profile = data?.profile
  const waitedOut = useElapsed(profileWaitMs)

  useApplyTheme(profile?.theme)
  const language = resolveLanguage(profile?.language, host.locale)
  const target = useMemo<FormatLocale>(
    () => ({
      language,
      locale: formattingLocale(language, host.locale),
      timeZone: validTimeZone(host.timeZone),
    }),
    [language, host.locale, host.timeZone],
  )
  // Publish before paint: the document language (screen readers — the view
  // document ships without one) and the formatters' locale. The tree below
  // reads the PUBLISHED value, so a widget never formats a date in one locale
  // while its strings render in another.
  useLayoutEffect(() => {
    document.documentElement.lang = target.language
    setFormatLocale(target)
  }, [target])
  const published = useSyncExternalStore(subscribeFormatLocale, getFormatLocale, getFormatLocale)

  // The first paint waits for the host (its theme and locale) and the
  // profile, or for the bound; afterwards the tree stays mounted for good and
  // only follows changes (a saved language flips live).
  const settled = (host.connected && !isPending) || waitedOut
  const [ready, setReady] = useState(false)
  if (!ready && settled && isPublished(published, target)) setReady(true)

  if (!ready) return host.connected ? <GateSkeleton language={language} /> : null
  return <LocaleProvider locale={published?.language ?? language}>{children}</LocaleProvider>
}

/** The formatters already render in `target` — the first paint may go ahead. */
function isPublished(published: FormatLocale | undefined, target: FormatLocale): boolean {
  return (
    published?.language === target.language &&
    published.locale === target.locale &&
    published.timeZone === target.timeZone
  )
}

/** The pre-paint placeholder: the toolkit view skeleton's shape, no visible text. */
function GateSkeleton({ language }: { language: string }) {
  return (
    <div className="flex flex-col gap-4 p-4" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <span role="status" className="sr-only">
        {kitLabels(language).loading}
      </span>
    </div>
  )
}
