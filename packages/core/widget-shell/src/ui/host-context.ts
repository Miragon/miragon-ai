import { explicitLocale, type Locale } from "../profile-constants.js"

/**
 * The shell's host-context resolution, pure: which theme and which locale a
 * view renders in, given what the host reported (SEP-1865 `hostContext`), the
 * OS and — for the language only — the user's explicit profile choice:
 *
 *   theme:     host context  >  OS preference (no in-app theme switch)
 *   language:  explicit profile choice  >  host context  >  English
 *
 * `system` (the profile's language default) is NOT an explicit choice — it
 * defers to the host. The DOM side lives in `applyDocumentTheme` (below) and
 * the hooks that feed it (`useApplyTheme`, `ProfileGate`).
 */

export type EffectiveTheme = "light" | "dark"

/** A host-reported theme, or `undefined` when the host reported none (or garbage). */
export function hostThemeOf(value: unknown): EffectiveTheme | undefined {
  return value === "light" || value === "dark" ? value : undefined
}

/**
 * The host's theme, else the OS `prefers-color-scheme`. Widgets follow the
 * host; there is no in-app theme switch (#322 owner decision).
 */
export function resolveTheme(
  hostTheme: EffectiveTheme | undefined,
  osPrefersDark: boolean,
): EffectiveTheme {
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
 * SEP-1865 host style variables → the NEUTRAL roles they stand for: the
 * canvas and its surfaces, the text on them and the decorative divider. The
 * host never sets a brand, interaction or status role — `--primary`, `--link`,
 * `--focus`, `--ring`, `--input` (the 3:1 control edge), `--accent` (the
 * selection tint) and every `--<tone>`/`-soft`/`-ink` stay the Miragon
 * theme's, so a host palette can neither recolour the brand nor drop a focus
 * ring or a field edge below its contrast floor.
 */
const HOST_TOKEN_MAP: Readonly<Record<string, readonly string[]>> = {
  "--color-background-primary": ["--background", "--card", "--popover"],
  "--color-background-secondary": ["--muted", "--secondary"],
  "--color-text-primary": [
    "--foreground",
    "--card-foreground",
    "--popover-foreground",
    "--secondary-foreground",
  ],
  "--color-text-secondary": ["--muted-foreground"],
  "--color-border-primary": ["--border"],
}

/** Every shell token a host variable can drive — cleared when the mapping does not apply. */
export const HOST_MAPPED_TOKENS: readonly string[] = Object.values(HOST_TOKEN_MAP).flat()

export type HostStyleVariables = Readonly<Record<string, string | undefined>>

/**
 * The neutral-role overrides the host's style variables imply — empty unless
 * the view renders in the HOST's theme: the host's palette describes its own
 * light or dark canvas, so a view on the OS theme (the host reported none)
 * keeps the Miragon neutrals.
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
 * class and `data-theme` (the toolkit theme's dark scope keys on both; SEP-1865
 * hosts and ext-apps read `data-theme`) and `color-scheme` (native controls,
 * scrollbars). The canvas stays transparent — the host's. The host's neutral
 * palette lands on the neutral roles while the view renders in the host's
 * theme; without a host theme every mapped role is cleared again.
 */
export function applyDocumentTheme(
  root: HTMLElement,
  { theme, hostTheme, hostVariables }: DocumentThemeInput,
): void {
  root.classList.toggle("dark", theme === "dark")
  root.setAttribute("data-theme", theme)
  root.style.setProperty("color-scheme", theme)
  const overrides = hostTokenOverrides(hostVariables, hostTheme === theme)
  for (const token of HOST_MAPPED_TOKENS) {
    const value = overrides[token]
    if (value === undefined) root.style.removeProperty(token)
    else root.style.setProperty(token, value)
  }
}
