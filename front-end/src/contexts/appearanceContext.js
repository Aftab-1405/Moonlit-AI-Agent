import { createContext, useContext } from 'react';
export const AppearanceContext = createContext(null);
/** Optional for components that also support standalone MUI themes. */
export const useOptionalAppearance = () => useContext(AppearanceContext)?.resolvedAppearance;
