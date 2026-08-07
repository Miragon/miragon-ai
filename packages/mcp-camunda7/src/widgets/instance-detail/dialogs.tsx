import { ConfirmDialog } from "../confirm-dialog.js"
import { useT } from "../../messages/use-t.js"
import type { InstanceActions } from "./use-instance-actions.js"

/** The confirm dialogs for the destructive instance actions (cancel, suspend/activate, resolve). */
export function InstanceActionDialogs({ actions }: { actions: InstanceActions }) {
  const t = useT()
  const {
    isSuspended,
    confirmCancel,
    setConfirmCancel,
    confirmSuspension,
    setConfirmSuspension,
    confirmResolveId,
    setConfirmResolveId,
    pendingIds,
    resolveError,
    suspensionMutation,
    cancelMutation,
    handleResolve,
    handleSuspendToggle,
    handleCancel,
  } = actions
  return (
    <>
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t("instanceDetail.confirmCancelTitle")}
        description={t("instanceDetail.confirmCancelDescription")}
        confirmLabel={t("instanceDetail.cancelInstance")}
        cancelLabel={t("confirmDialog.cancel")}
        pendingLabel={t("confirmDialog.working")}
        destructive
        pending={cancelMutation.isPending}
        error={cancelMutation.error?.message ?? null}
        onConfirm={handleCancel}
      />

      <ConfirmDialog
        open={confirmSuspension}
        onOpenChange={setConfirmSuspension}
        title={
          isSuspended
            ? t("instanceDetail.confirmActivateTitle")
            : t("instanceDetail.confirmSuspendTitle")
        }
        description={
          isSuspended
            ? t("instanceDetail.confirmActivateDescription")
            : t("instanceDetail.confirmSuspendDescription")
        }
        confirmLabel={isSuspended ? t("instanceDetail.activate") : t("instanceDetail.suspend")}
        cancelLabel={t("confirmDialog.cancel")}
        pendingLabel={t("confirmDialog.working")}
        pending={suspensionMutation.isPending}
        error={suspensionMutation.error?.message ?? null}
        onConfirm={handleSuspendToggle}
      />

      <ConfirmDialog
        open={confirmResolveId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmResolveId(null)
        }}
        title={t("instanceDetail.confirmResolveTitle")}
        description={t("instanceDetail.confirmResolveDescription")}
        confirmLabel={t("instanceDetail.resolve")}
        cancelLabel={t("confirmDialog.cancel")}
        pendingLabel={t("confirmDialog.working")}
        pending={confirmResolveId !== null && pendingIds.has(confirmResolveId)}
        error={
          confirmResolveId !== null && resolveError?.incidentId === confirmResolveId
            ? resolveError.message
            : null
        }
        onConfirm={() => {
          if (confirmResolveId) handleResolve(confirmResolveId)
        }}
      />
    </>
  )
}
