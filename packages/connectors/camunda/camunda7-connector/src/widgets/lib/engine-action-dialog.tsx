import { useState } from "react"

import { useT } from "../../messages/use-t.js"
import { ConfirmDialog } from "../confirm-dialog.js"
import type { EngineAction } from "./engine-action.js"

/**
 * The confirmation of an {@link EngineAction} — render it once next to the
 * controls that `run` the action. It stays open while the write is pending
 * and shows its failure; it closes when the write succeeds.
 */
export function EngineActionDialog<TArgs, TResult>({
  action,
}: {
  action: EngineAction<TArgs, TResult>
}) {
  const t = useT()
  const current = action.confirmation
  // The closing dialog keeps its last content through the exit animation
  // instead of flashing empty.
  const [shown, setShown] = useState(current)
  if (current !== null && current !== shown) setShown(current)
  const view = current ?? shown
  if (!view) return null
  const { spec } = view
  return (
    <ConfirmDialog
      open={current !== null}
      onOpenChange={(open) => {
        if (!open) action.dismiss()
      }}
      title={spec.title}
      description={spec.description}
      target={spec.target}
      confirmLabel={spec.confirmLabel}
      keepLabel={spec.keepLabel}
      pendingLabel={t("confirmDialog.working")}
      destructive={spec.destructive}
      pending={action.pending(view.target)}
      error={action.error(view.target)}
      onConfirm={action.confirm}
    />
  )
}
