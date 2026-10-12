import { useEffect, useRef, useState } from "react"
import { cn, FOCUS_RING, useLocale, useToast } from "@miragon/mcp-toolkit-ui"
import { Check, Copy } from "lucide-react"
import { Icon } from "./icon.js"
import { kitLabels } from "./kit-labels.js"
import { Td } from "./table.js"

/** Ids up to this length show whole; a longer one (a UUID) shows its first 8 characters. */
export const ID_FULL_LENGTH = 12
const ID_SHORT_LENGTH = 8

/** The id as a row shows it: whole up to {@link ID_FULL_LENGTH}, else its head and "…". */
export function shortId(value: string): string {
  return value.length <= ID_FULL_LENGTH ? value : `${value.slice(0, ID_SHORT_LENGTH)}…`
}

/** A hidden textarea and the selection copy: the path a sandboxed frame without the Clipboard API still has. */
function selectionCopy(text: string): boolean {
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  let copied: boolean
  try {
    copied = document.execCommand("copy")
  } catch {
    copied = false
  }
  area.remove()
  return copied
}

/**
 * Put `text` on the clipboard: the Clipboard API where the frame may use it
 * (a host grants `clipboard-write`), else the selection copy. Resolves to
 * whether it worked — a view says so either way, never silently.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Denied in this frame: fall through to the selection copy.
  }
  return selectionCopy(text)
}

/**
 * The whole id in a read-only field, focused and selected the moment it
 * appears — what a failed copy leaves you, so "copy it yourself" works for a
 * shortened id too. Leaving the field (or Escape) folds it back.
 */
function RevealedId({
  value,
  label,
  onDone,
}: {
  value: string
  label: string
  /** Fold back; `refocus` returns the focus to the copy button (Escape). */
  onDone: (refocus: boolean) => void
}) {
  const fieldRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    fieldRef.current?.focus()
    fieldRef.current?.select()
  }, [])
  return (
    <input
      ref={fieldRef}
      readOnly
      value={value}
      aria-label={label}
      size={value.length}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => onDone(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone(true)
      }}
      className={cn(
        "text-dense border-input bg-background text-foreground min-w-0 rounded-sm border px-1 font-mono",
        FOCUS_RING,
      )}
    />
  )
}

/**
 * A technical id (instance, job, incident …) the way a row shows it: Geist
 * Mono, shortened when long ("5f0ce78e…", the whole id in `title` and for
 * screen readers), with a copy button. The copy confirms with a toast ("ID
 * kopiert") and the icon turning into a check. A frame without clipboard
 * access says so in a toast instead of failing silently, and shows the whole
 * id selected in a read-only field, ready to copy by hand.
 */
export function IdText({ value, className }: { value: string; className?: string }) {
  const labels = kitLabels(useLocale())
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const short = shortId(value)
  const copy = async () => {
    if (await copyText(value)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.show({ tone: "success", title: labels.idCopied })
    } else {
      setRevealed(true)
      toast.show({ tone: "danger", title: labels.copyFailed, description: labels.copyFailedHint })
    }
  }
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1", className)}>
      {revealed ? (
        <RevealedId
          value={value}
          label={labels.fullId}
          onDone={(refocus) => {
            setRevealed(false)
            if (refocus) buttonRef.current?.focus()
          }}
        />
      ) : (
        <span className="text-dense truncate font-mono" title={value}>
          {short === value ? (
            value
          ) : (
            <>
              <span aria-hidden="true">{short}</span>
              <span className="sr-only">{value}</span>
            </>
          )}
        </span>
      )}
      <button
        ref={buttonRef}
        type="button"
        aria-label={labels.copyId(short)}
        title={labels.copyId(short)}
        onClick={() => void copy()}
        className={cn(
          "text-muted-foreground hover:text-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-sm",
          FOCUS_RING,
        )}
      >
        <Icon icon={copied ? Check : Copy} dense />
      </button>
    </span>
  )
}

/** A table cell holding one {@link IdText} — the id column of a list. */
export function IdCell({
  value,
  align,
  className,
}: {
  value: string
  align?: "left" | "right"
  className?: string
}) {
  return (
    <Td align={align} className={cn("whitespace-nowrap", className)}>
      <IdText value={value} />
    </Td>
  )
}
