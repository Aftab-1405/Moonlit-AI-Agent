import { useCallback, useRef, useState } from 'react';

const MAX_NOTIFICATIONS = 4;
const SNACKBAR_MESSAGE_LIMIT = 120;

function getCompactSnackbarMessage(message, fallback = 'Guidance available') {
  const text = String(message || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return fallback;
  if (text.length <= SNACKBAR_MESSAGE_LIMIT) return text;
  const sentenceEnd = text.search(/[.!?]\s/);
  if (sentenceEnd > 24 && sentenceEnd <= SNACKBAR_MESSAGE_LIMIT) {
    return text.slice(0, sentenceEnd + 1);
  }
  return `${text.slice(0, SNACKBAR_MESSAGE_LIMIT - 1).trim()}…`;
}

export function useNotifications() {
  // List of active toasts/notifications
  const [notifications, setNotifications] = useState([]);
  const nextIdRef = useRef(1);

  const removeToast = useCallback((id) => {
    setNotifications((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((type, title, message = undefined, duration = undefined) => {
    const id = nextIdRef.current++;

    // Determine duration based on notification type
    let finalDuration = duration;
    if (duration === undefined) {
      if (type === 'success') finalDuration = 3000;
      else if (type === 'error') finalDuration = 5000;
      else if (type === 'warning') finalDuration = 4000;
      else if (type === 'info') finalDuration = 4000;
      // loading has no auto-dismiss (duration is undefined)
    }

    const newToast = {
      id,
      type,
      title: getCompactSnackbarMessage(title),
      message,
      showIcon: true,
      duration: finalDuration,
    };

    setNotifications((prev) => {
      const nextList = [...prev, newToast];
      if (nextList.length > MAX_NOTIFICATIONS) {
        // Remove oldest notification if we exceed the limit
        return nextList.slice(nextList.length - MAX_NOTIFICATIONS);
      }
      return nextList;
    });

    return id;
  }, []);

  // Backwards compatibility wrapper for existing codebase calls
  const showSnackbar = useCallback(
    (message, severity = 'info') => {
      addToast(severity, message);
    },
    [addToast],
  );

  const handleCloseSnackbar = useCallback(() => {
    setNotifications([]);
  }, []);

  const success = useCallback(
    (title, message, duration) => addToast('success', title, message, duration),
    [addToast],
  );
  const error = useCallback(
    (title, message, duration) => addToast('error', title, message, duration),
    [addToast],
  );
  const warning = useCallback(
    (title, message, duration) => addToast('warning', title, message, duration),
    [addToast],
  );
  const info = useCallback(
    (title, message, duration) => addToast('info', title, message, duration),
    [addToast],
  );
  const loading = useCallback((title, message) => addToast('loading', title, message), [addToast]);

  return {
    // Notifications / Toasts
    notifications,
    showSnackbar,
    handleCloseSnackbar,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
    loading,
    setNotifications,
  };
}
