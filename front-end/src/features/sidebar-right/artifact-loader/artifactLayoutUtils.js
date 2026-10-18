import { useMemo } from 'react';
import { getInteractiveIconButtonSx } from '@/styles/shared';
import { TOUCH_DEVICE_QUERY } from '@/styles/mediaQueries';

export const ARTIFACT_ROOT_SX = {
  height: '100%',
  minHeight: 0,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

export function useArtifactActions(actions = []) {
  return useMemo(() => actions.filter((action) => action && !action.hidden), [actions]);
}

export const getArtifactActionButtonSx = (theme, { active = false, size = 36 } = {}) => ({
  ...getInteractiveIconButtonSx(theme, {
    active,
    size: { xs: 44, md: size },
    radius: theme.shape.radius.pill,
  }),
  flexShrink: 0,
  '& .MuiSvgIcon-root': { fontSize: '18px' },
  [TOUCH_DEVICE_QUERY]: { minWidth: 44, minHeight: 44 },
  '&.Mui-disabled': {
    color: theme.palette.text.disabled,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
});
