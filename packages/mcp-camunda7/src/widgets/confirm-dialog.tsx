import type { ReactNode } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@miragon/mcp-toolkit-ui"

/**
 * Controlled confirmation modal for destructive or mass actions originating in a
 * widget (cancel instance, batch-retry). Reversible single-entity actions
 * (suspend/activate, reassign, single retry) don't need it — a plain button is
 * enough. `children` is an optional extra body (e.g. a count summary or options).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  pending = false,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  pending?: boolean
  onConfirm: () => void
  children?: ReactNode
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
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
