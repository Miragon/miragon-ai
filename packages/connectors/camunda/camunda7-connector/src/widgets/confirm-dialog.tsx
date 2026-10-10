import { Fragment } from "react"
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@miragon/mcp-toolkit-ui"
import type { TargetLine } from "./lib/engine-action.js"

/**
 * Controlled confirmation modal for an engine write that asks first (cancel
 * instance, resolve incident, suspend/activate — `WRITE_POLICY`), rendered by
 * `EngineActionDialog`. It names its target as a label/value block and labels
 * both buttons with verb + object, so "Keep instance" can never be mistaken
 * for "Cancel instance".
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  target: readonly TargetLine[]
  confirmLabel: string
  keepLabel: string
  pendingLabel: string
  destructive?: boolean
  pending?: boolean
  /** Failure of the confirmed write — shown in the dialog so it can't be missed. */
  error?: string | null
  onConfirm: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <dl className="bg-muted grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md px-3 py-2 text-sm">
          {target.map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono break-all">{value}</dd>
            </Fragment>
          ))}
        </dl>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {keepLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
