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
import { SHELL_SETTINGS_DATA } from "../shell-settings-contract.js"
import { kitLabels } from "./kit-labels.js"
import { SHELL_SETTINGS_KEY } from "./shell-settings.js"
import { useShellHost } from "./shell-host.js"
import { useApplyTheme } from "./use-apply-theme.js"

/** The part of `shell_settings_data` the gate reads. */
interface ProfileFeed {
  language?: string
}

/**
 * How long the first paint waits for the profile, counted from the host
 * connection, before it renders from the host context alone.
 */
const PROFILE_WAIT_MS = 1_500

/**
 * How long the first paint waits for the host handshake itself, counted from
 * mount. Deliberately longer than the profile wait: painting before the host
 * context arrived is exactly the OS-theme/English flash the gate exists to
 * prevent, so only a host that never answers `ui/initialize` gets a view
 * without it.
 */
const HOST_WAIT_MS = 5_000

export interface ProfileGateProps {
  /**
   * The first paint's bound wait for the profile (ms, default
   * {@link PROFILE_WAIT_MS}), counted from the host connection — a slow
   * handshake never eats into it: a feed that neither answers nor fails in
   * time (a slow store) renders from the host context instead of holding the
   * view.
   */
  profileWaitMs?: number
  children: ReactNode
}

/**
 * Resolves the active user profile once at the app root — the shell's own
 * feed (`shell_settings_data`), under the key the language section shares
 * ({@link SHELL_SETTINGS_KEY}), so a saved language re-fetches one entry and
 * flips every view live (the refetch never re-shows the first-paint
 * skeleton) — and turns it, with
 * the host context ({@link useShellHost}), into the view's ONE effective
 * locale and theme — so every widget is localized and themed with zero
 * per-widget wiring:
 *  - language: explicit profile choice > `hostContext.locale` > English;
 *  - theme: `hostContext.theme` > the OS (applied document-wide by
 *    {@link useApplyTheme}; there is no in-app theme switch);
 *  - the shared date formatters follow the same locale and the host's time zone.
 * The first paint waits for the host handshake (bounded by {@link HOST_WAIT_MS}),
 * then for the profile (bounded by `profileWaitMs` from the connection) behind
 * a neutral skeleton, so a German profile or a dark host never flashes English
 * or the OS theme first. A feed that FAILS (e.g. a root without a profile store
 * registers no settings tools, or the host cannot call server tools) releases
 * the gate at its first failure
 * with the host-derived values — react-query keeps the query pending through
 * its retries, which run on in the background; a retry that answers later
 * still applies live.
 */
export function ProfileGate({ profileWaitMs, children }: ProfileGateProps) {
  const { callTool } = useHostBridge()
  // Adapt the host bridge's `Record<string, unknown>` args to the provider's
  // `object` signature.
  const callToolFn = useCallback(
    (name: string, args: object) => callTool(name, args as Record<string, unknown>),
    [callTool],
  )
  return (
    <AppQueryProvider callTool={callToolFn}>
      <ProfileGateInner profileWaitMs={profileWaitMs}>{children}</ProfileGateInner>
    </AppQueryProvider>
  )
}

/**
 * True once `ms` elapsed since `start` first held. The clock starts once and
 * never restarts, and the result never flips back.
 */
function useElapsedSince(start: boolean, ms: number): boolean {
  const [started, setStarted] = useState(start)
  if (start && !started) setStarted(true)
  const [elapsed, setElapsed] = useState(false)
  useEffect(() => {
    if (!started) return
    const id = setTimeout(() => setElapsed(true), ms)
    return () => clearTimeout(id)
  }, [started, ms])
  return elapsed
}

/**
 * Whether the first paint may go ahead. It waits for the host (its theme and
 * locale), then for the profile's answer: data, an error, or a FIRST failure
 * (the query stays pending through react-query's retries, ~7 s of backoff on
 * the toolkit's client) — or for the profile's bound, counted from the
 * connection. Only a host that never connects paints without its context,
 * after the longer host bound.
 */
function useFirstPaintSettled(
  connected: boolean,
  profile: { isPending: boolean; failureCount: number },
  profileWaitMs: number,
): boolean {
  const hostWaitedOut = useElapsedSince(true, HOST_WAIT_MS)
  const profileWaitedOut = useElapsedSince(connected, profileWaitMs)
  const profileAnswered = !profile.isPending || profile.failureCount > 0 || profileWaitedOut
  return (connected && profileAnswered) || hostWaitedOut
}

function ProfileGateInner({
  profileWaitMs = PROFILE_WAIT_MS,
  children,
}: Omit<ProfileGateProps, "children"> & { children: ReactNode }) {
  const host = useShellHost()
  const query = useToolQuery<ProfileFeed>([...SHELL_SETTINGS_KEY], SHELL_SETTINGS_DATA, {})
  const profile = query.data
  const settled = useFirstPaintSettled(host.connected, query, profileWaitMs)

  useApplyTheme()
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

  // Once settled and published, the tree stays mounted for good and only
  // follows changes (a saved language flips live).
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
