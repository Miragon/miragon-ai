import { supportedLanguage } from "./host-context.js"
import { ERROR_LABELS, type ErrorKindLabels, type ErrorSource } from "./error-labels.js"

export type { ErrorSource } from "./error-labels.js"

/**
 * What kind of failure an error text describes:
 * - `unreachable`: no connection, or the source answered 502/503;
 * - `timeout`: the deadline passed (the client's, or a 408/504);
 * - `notOnServer`: the tool is not on this server (its module is inactive);
 * - `unauthorized` / `forbidden`: the source refused the server (401 / 403);
 * - `notFound`: the entry is gone (404);
 * - `failed`: any other error status or engine exception;
 * - `unknown`: nothing the kit recognises.
 */
export type ErrorKind =
  | "unreachable"
  | "timeout"
  | "notOnServer"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "failed"
  | "unknown"

/** The facts `classifyError` reads from an error, before any words. */
export interface ErrorFacts {
  kind: ErrorKind
  /** HTTP status the text names, if any. */
  status?: number
  source: ErrorSource
  /** The raw text (the error's message), or null for an error without one. */
  raw: string | null
}

/** An error in words: for the toolkit's `ErrorState` (title, description, details). */
export interface DescribedError {
  kind: ErrorKind
  /** What happened, one line ("Die Engine prod ist nicht erreichbar (HTTP 503)"). */
  title: string
  /** What you can do next. */
  hint: string
  /** The raw reason for the collapsed "Details"; null when there was none. */
  details: string | null
}

/**
 * `[503 ProcessEngineException] …` (the camunda7 client's engine responses,
 * `withToolErrors`' `[code] …`) and `Prometheus query failed (503 …)`.
 */
const BRACKET_STATUS = /\[(\d{3})(?:[\s\]])/
const PROMETHEUS_STATUS = /Prometheus query failed \((\d{3})\b/
/** The engine id the camunda7 client appends or leads with. */
const ENGINE_ID =
  /\(engine ([^\s)]+)\)|\bengine (\S+) (?:unreachable|did not respond)|connection to engine (\S+) failed/
const ENGINE = /\bengine\b|ProcessEngineException|\bCamunda\b|\bCIB seven\b/i
const PROMETHEUS = /\bPrometheus\b/
const TOOL_MISSING = /\btool\b[^\n]*\bnot found\b|\bunknown tool\b|-32601\b|\bmethod not found\b/i
const TIMEOUT = /\(timeout\)|\btimed? ?out\b|-32001\b|did not respond within/i
const UNREACHABLE =
  /\bunreachable\b|\bconnection to \S+(?: \S+)? failed\b|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|\bfailed to fetch\b|\bfetch failed\b|\bnetworkerror\b|\bload failed\b/i

/** The message of whatever was thrown (an `Error`, a string, an `{ message }`). */
function rawText(error: unknown): string | null {
  if (error instanceof Error) return error.message.trim() || null
  if (typeof error === "string") return error.trim() || null
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message.trim() || null
  }
  return null
}

/** A numeric HTTP status on the error object (`status` / `httpStatus`), or in its text. */
function statusOf(error: unknown, text: string): number | undefined {
  if (typeof error === "object" && error !== null) {
    for (const key of ["httpStatus", "status"] as const) {
      const value = (error as Record<string, unknown>)[key]
      if (typeof value === "number" && value >= 100 && value <= 599) return value
    }
  }
  const match = BRACKET_STATUS.exec(text) ?? PROMETHEUS_STATUS.exec(text)
  return match ? Number(match[1]) : undefined
}

function sourceOf(text: string): ErrorSource {
  const id = ENGINE_ID.exec(text)
  if (id) return { type: "engine", id: id[1] ?? id[2] ?? id[3] }
  if (PROMETHEUS.test(text)) return { type: "prometheus" }
  if (ENGINE.test(text)) return { type: "engine" }
  return { type: "unknown" }
}

/** The kind an HTTP status stands for. */
function kindOfStatus(status: number): ErrorKind {
  if (status === 401) return "unauthorized"
  if (status === 403) return "forbidden"
  if (status === 404) return "notFound"
  if (status === 408 || status === 504) return "timeout"
  if (status === 502 || status === 503) return "unreachable"
  return "failed"
}

function kindOf(text: string, status: number | undefined): ErrorKind {
  if (TOOL_MISSING.test(text)) return "notOnServer"
  if (status !== undefined) return kindOfStatus(status)
  if (TIMEOUT.test(text)) return "timeout"
  if (UNREACHABLE.test(text)) return "unreachable"
  return "unknown"
}

/**
 * The facts of an engine or transport error, read from its text (the wire
 * carries text only: a tool's `isError` answer, a JSON-RPC error, a failed
 * fetch) plus a numeric `status`/`httpStatus` when the object has one. Pure:
 * no words, no locale.
 */
export function classifyError(error: unknown): ErrorFacts {
  const raw = rawText(error)
  const text = raw ?? ""
  const status = statusOf(error, text)
  return {
    kind: kindOf(text, status),
    ...(status !== undefined ? { status } : {}),
    source: sourceOf(text),
    raw,
  }
}

export interface DescribeErrorOptions {
  /**
   * The title for an error the kit cannot classify, in the caller's words
   * ("Die Prozessliste konnte nicht geladen werden"). Default: the kit's
   * "Das hat nicht geklappt" / "Something went wrong".
   */
  fallbackTitle?: string
}

/**
 * An engine or transport error in the words of the active locale (en/de by
 * `supportedLanguage`, English otherwise): what happened, what you can do,
 * and the raw text for a collapsed "Details" — never the raw
 * "[503 ProcessEngineException] …" as the headline. Feed the result to the
 * toolkit's `ErrorState` (`title`, `description` = hint, `details`); the
 * kit's `ViewDataState`, `QueryFallback`, `useDetailView`, `ConfirmDialog`
 * and `useActionFeedback` do.
 */
export function describeError(
  error: unknown,
  locale: string | undefined,
  options: DescribeErrorOptions = {},
): DescribedError {
  const labels = ERROR_LABELS[supportedLanguage(locale) ?? "en"]
  const facts = classifyError(error)
  const words: ErrorKindLabels = labels[facts.kind]
  const source = labels.source({ source: facts.source })
  const status = facts.status === undefined ? "" : labels.status({ status: facts.status })
  const title =
    facts.kind === "unknown" && options.fallbackTitle
      ? options.fallbackTitle
      : words.title({ source, status })
  return {
    kind: facts.kind,
    title,
    hint: words.hint({ source: facts.source.type }),
    details: facts.raw,
  }
}
