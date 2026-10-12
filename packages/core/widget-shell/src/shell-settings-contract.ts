import type { LanguagePref } from "./profile-constants.js"

/**
 * The shell's settings contract, shared by the server tools
 * (`shell-settings.ts`) and the widgets (`ui/shell-settings.tsx`) — no
 * runtime dependency, so the browser bundle imports it without server code.
 *
 * The shell owns the record-level preferences every module reads (today the
 * UI `language`) and the settings PAGE, which composes one section per module
 * (`<module>:settings`). Modules own only their `profile.modules.<module>`
 * slice and its section.
 */

/** Renders the settings page: the shell's language section, then every module's section. */
export const SHELL_SHOW_SETTINGS = "shell_show_settings"
/** App-only feed of the shell's section; also what `ProfileGate` reads the language from. */
export const SHELL_SETTINGS_DATA = "shell_settings_data"
/** Saves the record-level preferences (the UI language). */
export const SHELL_SAVE_SETTINGS = "shell_save_settings"

/** The settings page widget (`shell_show_settings`, the cockpit's settings tab). */
export const SHELL_SETTINGS_PAGE_WIDGET = "shell:settings-page"
/** The shell's own section on that page. */
export const SHELL_SETTINGS_WIDGET = "shell:settings"

/**
 * Why the section cannot save: no caller identity (no OAuth), or a deployment
 * whose framework writes are off (`frameworkWritesAllowed`: a module runs on
 * its read-only floor).
 */
export type ShellSettingsReadOnlyReason = "noSignIn" | "readOnly"

/** What `shell_settings_data` returns and `shell_show_settings` renders. */
export interface ShellSettingsView {
  language: LanguagePref
  canSave: boolean
  readOnlyReason: ShellSettingsReadOnlyReason | null
}
