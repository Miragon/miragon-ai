import { explicitLocale, type Locale } from "../profile-constants.js"

/**
 * The shell's host-context resolution, pure: which theme and which locale a
 * view renders in, given the user's explicit profile choice, what the host
 * reported (SEP-1865 `hostContext`) and the OS. One precedence for both:
 *
 *   explicit profile choice  >  host context  >  OS preference / English
 *
 * `system` (the profile default) is NOT an explicit choice — it defers to the
 * host. The DOM side lives in `applyDocumentTheme` (below) and the hooks that
 * feed it (`useApplyTheme`, `ProfileGate`).
 */

export type EffectiveTheme = "light" | "dark"

/** A host-reported theme, or `undefined` when the host reported none (or garbage). */
export function hostThemeOf(value: unknown): EffectiveTheme | undefined {
  return value === "light" || value === "dark" ? value : undefined
}

/** Explicit profile `light`/`dark` > the host's theme > the OS `prefers-color-scheme`. */
export function resolveTheme(
  profileTheme: string | undefined,
  hostTheme: EffectiveTheme | undefined,
  osPrefersDark: boolean,
): EffectiveTheme {
  if (profileTheme === "light" || profileTheme === "dark") return profileTheme
  return hostTheme ?? (osPrefersDark ? "dark" : "light")
}

/**
 * A BCP 47 tag's language when this build ships a catalog for it
 * (`de-AT` → `de`, `EN` → `en`), else `undefined` (`fr-FR`, garbage).
 */
export function supportedLanguage(tag: string | undefined): Locale | undefined {
  return explicitLocale(tag?.split(/[-_]/)[0]?.toLowerCase())
}

/** Explicit profile language > the host's locale (if supported) > English. */
export function resolveLanguage(
  profileLanguage: string | undefined,
  hostLocale: string | undefined,
): Locale {
  return explicitLocale(profileLanguage) ?? supportedLanguage(hostLocale) ?? "en"
}

/** The canonical form of a BCP 47 tag, or `undefined` when it is not one. */
function canonicalTag(tag: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(tag)[0]
  } catch {
    return undefined
  }
}

/**
 * The tag the shared formatters render dates in: the host's full tag when it
 * speaks the effective language (`de-AT` keeps Austrian conventions, `en-GB`
 * day-first dates), else the bare language — a German profile in an `en-US`
 * host formats German, not American.
 */
export function formattingLocale(language: Locale, hostLocale: string | undefined): string {
  if (!hostLocale || supportedLanguage(hostLocale) !== language) return language
  return canonicalTag(hostLocale) ?? language
}

/**
 * The host's IANA time zone when the runtime knows it, else `undefined` (the
 * browser's own) — an unknown zone would make every formatter throw.
 */
export function validTimeZone(timeZone: string | undefined): string | undefined {
  if (!timeZone) return undefined
  try {
    new Date(0).toLocaleString("en", { timeZone })
    return timeZone
  } catch {
    return undefined
  }
}

/**
 * SEP-1865 host style variables → the shell tokens they stand for. Only the
 * neutral ramp maps cleanly (canvas, text, border, focus ring); brand and
 * severity tones stay the shell's own, and the shadcn token definitions
 * themselves belong to the toolkit (mcp-toolkit#178).
 */
const HOST_TOKEN_MAP: Readonly<Record<string, readonly string[]>> = {
  "--color-background-primary": ["--background", "--card", "--popover"],
  "--color-background-secondary": ["--muted", "--secondary", "--accent"],
  "--color-text-primary": [
    "--foreground",
    "--card-foreground",
    "--popover-foreground",
    "--secondary-foreground",
    "--accent-foreground",
  ],
  "--color-text-secondary": ["--muted-foreground"],
  "--color-border-primary": ["--border", "--input"],
  "--color-ring-primary": ["--ring"],
}

/** Every shell token a host variable can drive — cleared when the mapping does not apply. */
export const HOST_MAPPED_TOKENS: readonly string[] = Object.values(HOST_TOKEN_MAP).flat()

export type HostStyleVariables = Readonly<Record<string, string | undefined>>

/**
 * The shell token overrides the host's style variables imply — empty unless
 * the view renders in the HOST's theme: the host's palette describes its own
 * light or dark canvas, so an explicit profile theme that differs keeps the
 * shell's tokens.
 */
export function hostTokenOverrides(
  variables: HostStyleVariables | undefined,
  followsHost: boolean,
): Record<string, string> {
  const overrides: Record<string, string> = {}
  if (!variables || !followsHost) return overrides
  for (const [source, tokens] of Object.entries(HOST_TOKEN_MAP)) {
    const value = variables[source]?.trim()
    if (!value) continue
    for (const token of tokens) overrides[token] = value
  }
  return overrides
}

export interface DocumentThemeInput {
  theme: EffectiveTheme
  /** What the host reported; `undefined` outside a host or before it answered. */
  hostTheme: EffectiveTheme | undefined
  hostVariables?: HostStyleVariables
}

/**
 * Apply ONE effective theme consistently to the document root: the `.dark`
 * class (every token and `dark:` variant keys on it), `data-theme` (what
 * SEP-1865 hosts and ext-apps read) and `color-scheme` (native controls,
 * scrollbars). The canvas stays transparent — the host's — while the view
 * follows the host theme; an explicit profile theme that differs paints its
 * own background, so its text never lands on the host's opposite canvas.
 */
export function applyDocumentTheme(
  root: HTMLElement,
  { theme, hostTheme, hostVariables }: DocumentThemeInput,
): void {
  root.classList.toggle("dark", theme === "dark")
  root.setAttribute("data-theme", theme)
  root.style.setProperty("color-scheme", theme)
  const followsHost = hostTheme === theme
  if (hostTheme !== undefined && !followsHost) {
    root.style.setProperty("background-color", "var(--background)")
  } else {
    root.style.removeProperty("background-color")
  }
  const overrides = hostTokenOverrides(hostVariables, followsHost)
  for (const token of HOST_MAPPED_TOKENS) {
    const value = overrides[token]
    if (value === undefined) root.style.removeProperty(token)
    else root.style.setProperty(token, value)
  }
}
