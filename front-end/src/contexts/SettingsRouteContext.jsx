import { createContext, useContext, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { normalizeSettingsSection } from '@/features/overlays/settings/settingsRegistry';
const SettingsRouteContext = createContext(null);
const FALLBACK_WORKSPACE = { pathname: '/chat', search: '', hash: '' };
export const useSettingsRoute = () => useContext(SettingsRouteContext); // eslint-disable-line react-refresh/only-export-components
export function SettingsRouteProvider({ children }) {
  const location = useLocation(),
    navigate = useNavigate();
  const open = location.pathname === '/settings' || location.pathname.startsWith('/settings/');
  const background = open
    ? location.state?.settingsBackground?.pathname?.startsWith('/chat')
      ? location.state.settingsBackground
      : FALLBACK_WORKSPACE
    : location;
  const value = useMemo(
    () => ({
      open,
      section: normalizeSettingsSection(location.pathname.split('/')[2]),
      background,
      openSection: (section) =>
        navigate(`/settings/${normalizeSettingsSection(section)}`, {
          state: { settingsBackground: background },
        }),
      close: () =>
        navigate(background.pathname + (background.search || '') + (background.hash || '')),
    }),
    [open, location.pathname, background, navigate],
  );
  return (
    <SettingsRouteContext.Provider value={value}>
      {children(background)}
    </SettingsRouteContext.Provider>
  );
}
