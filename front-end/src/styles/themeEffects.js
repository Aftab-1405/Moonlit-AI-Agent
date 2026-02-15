import { alpha } from '@mui/material/styles';
import { BACKDROP_FILTER_FALLBACK_QUERY } from './mediaQueries';

export const TRANSITIONS = {
  default: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  smooth: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  bounce: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  fade: 'opacity 200ms ease-in-out',
};

export const KEYFRAMES = {
  '@keyframes float': {
    '0%, 100%': { transform: 'translateY(0) scale(1)' },
    '50%': { transform: 'translateY(30px) scale(1.05)' },
  },
  '@keyframes shimmer': {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
  '@keyframes fadeIn': {
    from: { opacity: 0, transform: 'translateY(8px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  '@keyframes pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.5 },
  },
  '@keyframes slideIn': {
    from: { transform: 'translateX(-100%)' },
    to: { transform: 'translateX(0)' },
  },
  '@keyframes slideUp': {
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
};

const gradientCache = new WeakMap();
const accentEffectsCache = new WeakMap();

export const getMoonlitGradient = (theme) => {
  if (gradientCache.has(theme)) return gradientCache.get(theme);
  const isDark = theme.palette.mode === 'dark';
  const p = theme.palette.text.primary;
  const gradient = isDark
    ? `linear-gradient(135deg, ${alpha(p, 0.2)}, ${alpha(p, 0.8)})`
    : `linear-gradient(135deg, ${alpha(p, 0.6)}, ${alpha(p, 0.3)})`;
  gradientCache.set(theme, gradient);
  return gradient;
};

export const getAccentEffects = (theme) => {
  if (accentEffectsCache.has(theme)) return accentEffectsCache.get(theme);
  const isDark = theme.palette.mode === 'dark';
  const main = theme.palette.text.primary;
  const gradient = isDark
    ? `linear-gradient(135deg, ${alpha(main, 0.6)}, ${main})`
    : `linear-gradient(135deg, ${main}, ${alpha(main, 0.8)})`;

  const effects = isDark
    ? {
        gradient,
        textGradient: gradient,
        glow: `0 0 20px ${alpha(main, 0.1)}, 0 0 40px ${alpha(main, 0.05)}`,
        border: `1px solid ${alpha(main, 0.15)}`,
        background: alpha(main, 0.05),
      }
    : {
        gradient,
        textGradient: gradient,
        glow: `0 4px 20px ${alpha(main, 0.08)}`,
        border: `1px solid ${alpha(main, 0.1)}`,
        background: alpha(main, 0.03),
      };

  const frozen = Object.freeze(effects);
  accentEffectsCache.set(theme, frozen);
  return frozen;
};

export const getGlassSx = (theme) => ({
  backgroundColor: theme.palette.glassmorphism.background,
  backdropFilter: theme.palette.glassmorphism.backdropFilter,
  WebkitBackdropFilter: theme.palette.glassmorphism.backdropFilter,
  border: `1px solid ${theme.palette.glassmorphism.borderColor}`,
  [BACKDROP_FILTER_FALLBACK_QUERY]: {
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
  },
});

export const getGlowButtonSx = (theme) => {
  const isDark = theme.palette.mode === 'dark';
  const main = theme.palette.primary.main;
  return {
    px: 3,
    py: 1.5,
    borderRadius: 2,
    fontWeight: 600,
    background: main,
    color: theme.palette.primary.contrastText,
    border: 'none',
    boxShadow: isDark
      ? `0 4px 15px ${alpha(theme.palette.common.black, 0.4)}`
      : `0 4px 15px ${alpha(theme.palette.common.black, 0.15)}`,
    transition: TRANSITIONS.smooth,
    '&:hover': {
      background: isDark ? theme.palette.primary.light : theme.palette.primary.dark,
      boxShadow: isDark
        ? `0 6px 20px ${alpha(theme.palette.common.black, 0.5)}`
        : `0 6px 20px ${alpha(theme.palette.common.black, 0.2)}`,
      transform: 'translateY(-2px)',
    },
    '&:active': {
      transform: 'scale(0.98)',
    },
  };
};

export const getGradientTextSx = (theme) => ({
  background: getMoonlitGradient(theme),
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
});
