/**
 * useOverlayState
 *
 * Manages all transient overlay UI state: the database modal, settings modal,
 * and the modern application notification/toast list.
 */

import { useCallback, useState } from 'react';
import { useSettingsRoute } from '@/contexts/SettingsRouteContext';
import { useNotifications } from '@/hooks/useNotifications';

export function useOverlayState() {
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [localSettingsOpen, setLocalSettingsOpen] = useState(false);
  const [dbModalInitialType, setDbModalInitialType] = useState(null);
  const [localInitialSection, setLocalInitialSection] = useState(null);

  const route = useSettingsRoute();
  const settingsOpen = route ? route.open : localSettingsOpen;
  const settingsInitialSection = route?.open ? route.section : localInitialSection;
  const setSettingsOpen = useCallback(
    (value, section = localInitialSection) => {
      if (route) {
        if (value) route.openSection(section || 'general');
        else if (route.open) route.close();
      } else setLocalSettingsOpen(value);
    },
    [route, localInitialSection],
  );
  const setSettingsInitialSection = useCallback(
    (value) => {
      setLocalInitialSection(value);
      if (route?.open) route.openSection(value);
    },
    [route],
  );
  const notifications = useNotifications();

  const handleCloseDbModal = useCallback(() => setDbModalOpen(false), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);

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
