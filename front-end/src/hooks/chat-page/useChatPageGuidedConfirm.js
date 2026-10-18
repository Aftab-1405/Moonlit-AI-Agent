// useChatPageGuidedConfirm — agent interrupt / step-limit / navigate-new-chat
// confirmation banner state.
//
// Owns:
//   - guidedConfirmDialog state (open, title, message, confirmText, cancelText,
//     onCancel, onConfirm)
//
// Handlers:
//   - openGuidedConfirm(payload) — set state and open
//   - closeGuidedConfirm()       — reset to defaults and close
//   - handleGuidedCancel()       — fire onCancel then close
//   - handleGuidedConfirm()      — fire onConfirm then close
//
// This is split out so the streaming hook can register interrupts without
// holding dialog state itself, and so ChatWorkspacePage can render the banner
// without reaching into streaming internals.

import { useCallback, useState } from 'react';

const DEFAULT_STATE = {
  open: false,
  title: '',
  message: '',
  confirmText: 'Confirm',
  cancelText: 'Not now',
  onCancel: null,
  onConfirm: null,
};

export function useChatPageGuidedConfirm() {
  const [guidedConfirmDialog, setGuidedConfirmDialog] = useState(DEFAULT_STATE);

  const openGuidedConfirm = useCallback((payload) => {
    setGuidedConfirmDialog({
      open: true,
      title: payload?.title || 'Confirm action',
      message: payload?.message || 'Please confirm before I continue.',
      confirmText: payload?.confirmText || 'Confirm',
      cancelText: payload?.cancelText || 'Not now',
      onCancel: payload?.onCancel ?? null,
      onConfirm: payload?.onConfirm ?? null,
      // Allow callers (e.g. step-limit handler) to attach extra fields
      // (stepsUsed, taskMode) for accessibility/inspection.
      ...(payload?.stepsUsed != null ? { stepsUsed: payload.stepsUsed } : null),
    });
  }, []);

  const closeGuidedConfirm = useCallback(() => {
    setGuidedConfirmDialog(DEFAULT_STATE);
  }, []);

  const handleGuidedCancel = useCallback(async () => {
    const action = guidedConfirmDialog.onCancel;
    closeGuidedConfirm();
    await action?.();
  }, [closeGuidedConfirm, guidedConfirmDialog.onCancel]);

  const handleGuidedConfirm = useCallback(async () => {
    const action = guidedConfirmDialog.onConfirm;
    closeGuidedConfirm();
    await action?.();
  }, [closeGuidedConfirm, guidedConfirmDialog.onConfirm]);

  return {
    guidedConfirmDialog,
    setGuidedConfirmDialog,
    openGuidedConfirm,
    closeGuidedConfirm,
    handleGuidedCancel,
    handleGuidedConfirm,
  };
}
