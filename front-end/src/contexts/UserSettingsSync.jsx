/**
 * Loads account settings from the server on login and debounces saves on change.
 * @module UserSettingsSync
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { getUserSettings, saveUserSettings } from '@/api';
import { queryKeys } from '@/api/queryClient';
import { mapServerSettingsToClient, pickSyncableSettings } from '@/config/userSettings';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import logger from '@/utils/logger';

const PERSIST_DEBOUNCE_MS = 700;

export function UserSettingsSync() {
  const { isAuthenticated, loading, user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const hydratedRef = useRef(false);
  const skipPersistRef = useRef(true);
  const settingsQuery = useQuery({
    queryKey: queryKeys.userSettings(user?.uid),
    queryFn: getUserSettings,
    enabled: isAuthenticated && !loading,
    staleTime: 5 * 60 * 1000,
  });
  const { mutate: saveSettings } = useMutation({
    mutationFn: saveUserSettings,
  });

  useEffect(() => {
    hydratedRef.current = false;
    skipPersistRef.current = true;
  }, [user?.uid]);

  useEffect(() => {
    if (!isAuthenticated || loading) {
      hydratedRef.current = false;
      skipPersistRef.current = true;
      return undefined;
    }

    if (settingsQuery.isLoading || settingsQuery.isFetching) return undefined;

    if (settingsQuery.isError) {
      logger.warn('Failed to load user settings from server:', settingsQuery.error);
      hydratedRef.current = true;
      skipPersistRef.current = false;
      return undefined;
    }

    const patch = mapServerSettingsToClient(settingsQuery.data);
    if (Object.keys(patch).length > 0) {
      skipPersistRef.current = true;
      updateSettings(patch);
    } else {
      skipPersistRef.current = false;
    }
    hydratedRef.current = true;
    return undefined;
  }, [
    isAuthenticated,
    loading,
    settingsQuery.data,
    settingsQuery.error,
    settingsQuery.isError,
    settingsQuery.isFetching,
    settingsQuery.isLoading,
    updateSettings,
  ]);

  useEffect(() => {
    if (!isAuthenticated || loading || !hydratedRef.current || skipPersistRef.current) {
      if (isAuthenticated && !loading && hydratedRef.current && skipPersistRef.current) {
        skipPersistRef.current = false;
      }
      return undefined;
    }

    const timer = window.setTimeout(() => {
      saveSettings(pickSyncableSettings(settings), {
        onError: (error) => {
          logger.warn('Failed to save user settings to server:', error);
        },
      });
    }, PERSIST_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [settings, isAuthenticated, loading, saveSettings]);

  return null;
}
