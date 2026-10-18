/**
 * useOverlayState
 *
 * Manages all transient overlay UI state: the database modal, settings modal,
 * and the modern application notification/toast list.
 */

import { useCallback, useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';

export function useOverlayState() {
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dbModalInitialType, setDbModalInitialType] = useState(null);
  const [settingsInitialSection, setSettingsInitialSection] = useState(null);

  const notifications = useNotifications();

  const handleCloseDbModal = useCallback(() => setDbModalOpen(false), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);

  return {
    // DB modal
    dbModalOpen,
    setDbModalOpen,
    dbModalInitialType,
    setDbModalInitialType,
    handleCloseDbModal,
    // Settings modal
    settingsOpen,
    setSettingsOpen,
    settingsInitialSection,
    setSettingsInitialSection,
    handleCloseSettings,
    ...notifications,
  };
}
