import { HOVER_CAPABLE_QUERY, TOUCH_DEVICE_QUERY } from '../styles/mediaQueries.js';

export function getFullCodeBlockStyles(theme) {
  return {
    frame: {
      position: 'relative',
      width: '100%',
      minWidth: 0,
      my: 2,
      overflow: 'hidden',
      border: '1px solid',
      borderColor: theme.palette.border.subtle,
      borderRadius: '8px',
      backgroundColor: theme.palette.background.paper,
      boxShadow: 'none',
      '&:focus-visible': {
        outline: 'none',
        boxShadow: `inset 0 0 0 2px ${theme.palette.border.focus}`,
      },
      [HOVER_CAPABLE_QUERY]: {
        '& .code-block-actions': {
          opacity: 0,
          pointerEvents: 'none',
        },
        '&:hover .code-block-actions, &:focus-within .code-block-actions': {
          opacity: 1,
          pointerEvents: 'auto',
        },
      },
      [TOUCH_DEVICE_QUERY]: {
        '& .code-block-actions': {
          opacity: 1,
          pointerEvents: 'auto',
        },
      },
    },
    languageLabel: {
      minHeight: 31,
      padding: '14px 14px 0',
      display: 'flex',
      alignItems: 'center',
      gap: 1,
      color: 'text.secondary',
    },
    actions: {
      position: 'absolute',
      zIndex: 2,
      top: 7,
      right: 7,
      display: 'flex',
      alignItems: 'center',
      gap: 0.25,
      p: 0.25,
      borderRadius: '8px',
      backgroundColor: theme.palette.background.paper,
      backdropFilter: 'blur(12px)',
      transition: theme.transitions.create('opacity', {
        duration: theme.transitions.duration.shorter,
      }),
    },
    scroller: {
      overflowX: 'auto',
      padding: '14px',
      scrollbarWidth: 'thin',
      scrollbarColor: `${theme.palette.border.subtle} transparent`,
      '&::-webkit-scrollbar': { height: 6 },
      '&::-webkit-scrollbar-thumb': {
        borderRadius: 999,
        backgroundColor: theme.palette.border.subtle,
      },
    },
    pre: {
      fontFamily: theme.typography.fontFamilyMono,
      fontSize: 'var(--font-code-size, 12px)',
      lineHeight: 1.625,
      color: 'text.primary',
    },
  };
}
