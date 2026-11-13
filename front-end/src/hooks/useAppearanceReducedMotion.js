import { useTheme } from '@mui/material/styles';
import { useReducedMotion } from 'framer-motion';
import { useOptionalAppearance } from '@/contexts/appearanceContext';
import { getReducedMotion } from '@/theme/mode';
export function useAppearanceReducedMotion() {
  const system = useReducedMotion();
  const theme = useTheme();
  const appearance = useOptionalAppearance();
  return (
    appearance?.reducedMotionResolved ??
    getReducedMotion(theme.palette.integration?.appearance?.reducedMotion || 'system', system)
  );
}
