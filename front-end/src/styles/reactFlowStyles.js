import { alpha } from '@mui/material/styles';
import { TOUCH_DEVICE_QUERY } from '@/styles/mediaQueries';

export const FLOW_NODE_CARD_CLASS = 'moonlit-flow-node-card';
export const HIDDEN_FLOW_HANDLE_STYLE = {
  opacity: 0,
  width: 10,
  height: 10,
  minWidth: 10,
  minHeight: 10,
  border: 0,
  background: 'transparent',
  pointerEvents: 'none',
};

const FLOW_NODE_RADIUS = '8px';

export const getReactFlowAlphaColor = (color, opacity, fallback = null) => {
  if (typeof color !== 'string' || !color.trim()) return fallback;
  try {
    return alpha(color, opacity);
  } catch {
    return fallback;
  }
};

const getCustomStyleAccent = (style) => {
  if (!style || typeof style !== 'object') return null;
  return style.borderColor || style.backgroundColor || style.color || null;
};

export const getReactFlowCanvasSx = (theme, { cardClassName = FLOW_NODE_CARD_CLASS } = {}) => ({
  width: '100%',
  height: '100%',
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: theme.palette.background.default,
  '& .react-flow': {
    '--xy-edge-stroke-default': theme.palette.text.disabled,
    '--xy-edge-stroke-width-default': 1.5,
    '--xy-edge-stroke-selected-default': theme.palette.text.primary,
    '--xy-connectionline-stroke-default': theme.palette.text.secondary,
    '--xy-connectionline-stroke-width-default': 1.5,
    '--xy-background-pattern-dots-color-default': theme.palette.border.default,
    '--xy-background-pattern-line-color-default': theme.palette.border.subtle,
    '--xy-handle-background-color-default': theme.palette.background.paper,
    '--xy-handle-border-color-default': theme.palette.text.secondary,
    '--xy-node-boxshadow-hover-default': 'none',
    '--xy-node-boxshadow-selected-default': 'none',
    '--xy-selection-background-color-default': theme.palette.action.selected,
    '--xy-selection-border-default': `1px dotted ${theme.palette.border.hover}`,
  },
  '& .react-flow__controls': {
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: 'none',
    border: `1px solid ${theme.palette.border.subtle}`,
    backgroundColor: theme.palette.background.paper,
  },
  '& .react-flow__controls-button': {
    width: 36,
    height: 36,
    boxSizing: 'border-box',
    [TOUCH_DEVICE_QUERY]: { width: 44, height: 44 },
    backgroundColor: 'transparent',
    color: theme.palette.text.primary,
    fill: 'currentColor',
    borderColor: theme.palette.border.separator,
    '&:hover': { backgroundColor: theme.palette.action.hover },
    '&:focus-visible': { outline: `2px solid ${theme.palette.border.focus}`, outlineOffset: -2 },
  },
  '& .react-flow__pane': { cursor: 'grab' },
  '& .react-flow__pane:active': { cursor: 'grabbing' },
  '& .react-flow__node': { borderRadius: FLOW_NODE_RADIUS, outline: 'none' },
  [`& .react-flow__node.selected .${cardClassName}`]: {
    borderColor: theme.palette.text.secondary,
  },
  [`& .react-flow__node:focus-visible .${cardClassName}`]: {
    outline: `2px solid ${theme.palette.border.focus}`,
    outlineOffset: 3,
  },
  '& .react-flow__edge-path': {
    strokeLinecap: 'round',
    transition: 'stroke 160ms ease, stroke-width 160ms ease, opacity 160ms ease',
  },
  '& .react-flow__edges': { zIndex: 0 },
  '& .react-flow__nodes': { zIndex: 1 },
  '& .react-flow__edge.selected .react-flow__edge-path': {
    strokeWidth: 2.4,
    stroke: theme.palette.text.primary,
  },
  '& .react-flow__edge:hover .react-flow__edge-path': {
    strokeWidth: 2.2,
    stroke: theme.palette.text.secondary,
  },
  '& .react-flow__edge-textbg': {
    fill: theme.palette.background.paper,
    stroke: theme.palette.border.subtle,
    strokeWidth: 1,
  },
  '& .react-flow__edge-text': {
    fill: theme.palette.text.secondary,
    fontFamily: theme.typography.fontFamilyMono,
    fontSize: 10,
    fontWeight: 400,
  },
  '& .react-flow__handle': {
    width: 10,
    height: 10,
    border: `1px solid ${theme.palette.text.secondary}`,
    background: theme.palette.background.paper,
  },
});

export const getReactFlowNodeCardSx = (theme, { disabled = false, interactive = false } = {}) => ({
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  borderRadius: FLOW_NODE_RADIUS,
  border: '1px solid',
  borderColor: theme.palette.border.subtle,
  backgroundColor: disabled ? theme.palette.background.default : theme.palette.background.paper,
  boxShadow: 'none',
  cursor: interactive ? 'pointer' : 'default',
  transition: 'border-color 160ms ease, background-color 160ms ease, opacity 160ms ease',
  '&:hover': interactive
    ? {
        borderColor: theme.palette.border.hover,
        backgroundColor: disabled ? theme.palette.background.default : theme.palette.layer.soft,
      }
    : undefined,
});

export const getReactFlowNodeChromeSx = () => ({
  overflow: 'hidden',
  isolation: 'isolate',
});

export const getReactFlowStatusSx = (theme, status) => {
  const tone =
    {
      active: theme.palette.success.main,
      cached: theme.palette.text.secondary,
      error: theme.palette.error.main,
      pending: theme.palette.info.main,
      blocked: theme.palette.error.main,
      disabled: theme.palette.text.disabled,
      ready: theme.palette.text.secondary,
      running: theme.palette.info.main,
      success: theme.palette.success.main,
      warning: theme.palette.warning.main,
    }[status] || theme.palette.text.secondary;

  return {
    color: tone,
    backgroundColor: alpha(tone, theme.palette.opacity.statusBackground),
    borderColor: alpha(tone, theme.palette.opacity.statusBorderSelected),
    boxShadow: 'none',
  };
};

export const getReactFlowCustomNodeAccentSx = (theme, customStyle) => {
  const accent = getCustomStyleAccent(customStyle);
  const accentBorder = getReactFlowAlphaColor(accent, theme.palette.opacity.emphasis);
  if (!accentBorder) return {};

  return {
    borderRadius: FLOW_NODE_RADIUS,
    borderColor: getReactFlowAlphaColor(accent, theme.palette.opacity.focus) || accentBorder,
    borderLeft: `4px solid ${accent}`,
    backgroundColor: theme.palette.background.paper,
    boxShadow: 'none',
    '&:hover': {
      borderColor: getReactFlowAlphaColor(accent, theme.palette.opacity.emphasis) || accentBorder,
    },
  };
};

export const getReactFlowEdgeStyle = (theme, { isMobile = false, emphasis = 'default' } = {}) => {
  const isSubtle = emphasis === 'subtle';
  return {
    stroke: alpha(
      theme.palette.text.secondary,
      isSubtle ? theme.palette.opacity.focus : theme.palette.opacity.emphasis,
    ),
    strokeWidth: isMobile ? (isSubtle ? 1.5 : 1.85) : isSubtle ? 1.3 : 1.65,
    opacity: isSubtle ? 0.8 : 0.9,
  };
};

export const getReactFlowDefaultEdgeOptions = (theme, { isMobile = false } = {}) => ({
  style: getReactFlowEdgeStyle(theme, { isMobile }),
  labelStyle: {
    fill: theme.palette.text.secondary,
    fontFamily: theme.typography.fontFamilyMono,
    fontSize: 10,
    fontWeight: 400,
  },
  labelBgStyle: {
    fill: theme.palette.background.paper,
    stroke: theme.palette.border.subtle,
    strokeWidth: 1,
  },
  labelBgPadding: [9, 5],
  labelBgBorderRadius: 8,
});

export const getReactFlowBackgroundColor = (theme) => theme.palette.background.default;

export const getReactFlowNodeStatusDotSx = (theme, status) => {
  const tone =
    {
      active: theme.palette.success.main,
      cached: theme.palette.text.secondary,
      error: theme.palette.error.main,
      pending: theme.palette.info.main,
      blocked: theme.palette.error.main,
      disabled: theme.palette.text.disabled,
      ready: theme.palette.text.secondary,
      running: theme.palette.info.main,
      success: theme.palette.success.main,
      warning: theme.palette.warning.main,
    }[status] || theme.palette.text.secondary;
  return { backgroundColor: tone, boxShadow: 'none' };
};

export const getReactFlowTagChipSx = (theme) => ({
  display: 'inline-flex',
  alignItems: 'center',
  px: 0.75,
  py: 0.25,
  borderRadius: theme.shape.radius?.full ?? '9999px',
  border: '1px solid',
  borderColor: theme.palette.border.subtle,
  backgroundColor: theme.palette.background.default,
  fontFamily: theme.typography.fontFamilyMono,
  fontSize: 9,
  fontWeight: 400,
  lineHeight: 1,
  letterSpacing: 0,
  color: theme.palette.text.secondary,
  whiteSpace: 'nowrap',
  maxWidth: 80,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const getReactFlowCountBadgeSx = (theme) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  px: 0.875,
  py: 0.3,
  borderRadius: theme.shape.radius?.full ?? '9999px',
  border: '1px solid',
  borderColor: theme.palette.border.default,
  backgroundColor: theme.palette.background.default,
  fontFamily: theme.typography.fontFamilyMono,
  fontSize: 10,
  fontWeight: 400,
  lineHeight: 1,
  letterSpacing: 0,
  color: theme.palette.text.secondary,
  minWidth: 20,
});
