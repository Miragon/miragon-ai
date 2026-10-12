import { Fragment } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  useLocale,
} from "@miragon/mcp-toolkit-ui"
import { describeError } from "./describe-error.js"
import { kitLabels } from "./kit-labels.js"

/** One line of a confirmation's target block: what it is, and its id or name. */
export type ConfirmTarget = readonly [label: string, value: string]

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The question ("Cancel this instance?"). */
  title: string
  /** The consequence, in one or two sentences. */
  description: string
  /** What the write acts on, by name — at least one line. */
  target: readonly ConfirmTarget[]
  /** The write as verb + object ("Cancel instance"). */
  confirmLabel: string
  /** Not doing it, as verb + object ("Keep instance") — never a bare "Cancel". */
  keepLabel: string
  /** The confirm button while the write runs (default: the locale's "Working…"). */
  pendingLabel?: string
  /** An irreversible write: the confirm button in the danger role. */
  destructive?: boolean
  /** The confirmed write is in flight: both buttons wait, the dialog stays. */
  pending?: boolean
  /** Failure of the confirmed write, shown in the dialog so it can't be missed. */
  error?: unknown
  onConfirm: () => void
}

/**
 * The confirmation before an irreversible or state-changing write (CI §8,
 * §9 "Destruktiv"), on the toolkit's `Dialog`: the scrim behind it
 * (`--scrim`, 42 % black plus blur), a centred panel with the md radius and
 * `shadow-3`, the question as its 600 heading, the close button, the buttons
 * right-aligned. It is an `alertdialog`: it interrupts and needs an answer.
 *
 * It names its target as a label/value block (ids in Geist Mono) and labels
 * both buttons with verb + object, so "Keep instance" can never be mistaken
 * for "Cancel instance"; a destructive write's button is in the danger role.
 * While the write runs the dialog cannot be dismissed (its outcome would be
 * hidden); a failure shows inside it (`describeError`, raw text under
 * "Details") and the user can try again or keep.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  target,
  confirmLabel,
  keepLabel,
  pendingLabel,
  destructive = false,
  pending = false,
  error = null,
  onConfirm,
}: ConfirmDialogProps) {
  const locale = useLocale()
  const described = error ? describeError(error, locale) : null
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <DialogContent role="alertdialog" showCloseButton={!pending} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-body">{description}</DialogDescription>
        </DialogHeader>
        <dl className="bg-muted text-dense grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-sm px-3 py-2">
          {target.map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono break-all">{value}</dd>
            </Fragment>
          ))}
        </dl>
        {described && (
          <ErrorState
            variant="inline"
            title={described.title}
            description={described.hint}
            details={described.details ?? undefined}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {keepLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? (pendingLabel ?? kitLabels(locale).working) : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
