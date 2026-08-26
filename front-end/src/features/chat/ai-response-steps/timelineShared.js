import { keyframes } from '@mui/material/styles';
import { HOVER_CAPABLE_QUERY } from '../../../styles/mediaQueries.js';

/**
 * Entry animation for timeline items and accordion.
 * Pure opacity-fade — no translateY — so items materialise in-place
 * instead of flying up from below, which felt like a loading delay.
 */
export const slideIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

export const TIMELINE_LINE_X = { xs: 12, sm: 14 };

/** Center a timeline node within the padded title row at each breakpoint. */
export function getTimelineNodeTopSx({
  mobileTitleMinHeight,
  desktopTitleMinHeight,
  itemPadding,
}) {
  return {
    xs: itemPadding + mobileTitleMinHeight / 2,
    md: itemPadding + desktopTitleMinHeight / 2,
  };
}

/**
 * Interactive reasoning controls share the surrounding timeline surface.
 * Hover and pressed states change ink only; focus retains the accessible ring.
 */
export function getFlatStepControlSx(
  theme,
  { size = { xs: 44, md: 32 }, radius = theme.shape.radius.pill } = {},
) {
  return {
    minHeight: size,
    borderRadius: radius,
    color: theme.palette.text.secondary,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    boxShadow: 'none',
    transition: theme.transitions.create(['color', 'box-shadow'], {
      duration: theme.transitions.duration.shorter,
    }),
    [HOVER_CAPABLE_QUERY]: {
      '&:hover': {
        color: theme.palette.text.primary,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        boxShadow: 'none',
      },
    },
    '&:active': {
      backgroundColor: 'transparent',
      boxShadow: 'none',
    },
    '&:focus-visible': {
      color: theme.palette.text.primary,
      backgroundColor: 'transparent',
      boxShadow: 'none',
      outline: `2px solid ${theme.palette.border.focus}`,
      outlineOffset: 2,
    },
  };
}
