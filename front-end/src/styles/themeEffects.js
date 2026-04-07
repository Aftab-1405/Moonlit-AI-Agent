import { alpha } from '@mui/material/styles';
import { BACKDROP_FILTER_FALLBACK_QUERY } from './mediaQueries';

export const TRANSITIONS = {
  default: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  smooth: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  bounce: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  fade: 'opacity 200ms ease-in-out',
  fast: 'all 120ms cubic-bezier(0.4, 0, 0.2, 1)',
  enter: 'all 220ms ease-in',
  exit: 'all 180ms ease-out',
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
  '@keyframes spin': {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
  },
  '@keyframes scaleIn': {
    from: { opacity: 0, transform: 'scale(0.92)' },
    to: { opacity: 1, transform: 'scale(1)' },
  },
  '@keyframes scaleOut': {
    from: { opacity: 1, transform: 'scale(1)' },
    to: { opacity: 0, transform: 'scale(0.92)' },
  },
};

const gradientCache = new WeakMap();
const accentEffectsCache = new WeakMap();

export const getMoonlitGradient = (theme) => {
  if (gradientCache.has(theme)) return gradientCache.get(theme);
  const isDark = theme.palette.mode === 'dark';
  // Neutral graphite gradient for monochrome surfaces and text accents
  const gradient = isDark
    ? `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.92)}, ${alpha(theme.palette.secondary.main, 0.82)})`
    : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.94)}, ${alpha(theme.palette.secondary.main, 0.80)})`;
  gradientCache.set(theme, gradient);
  return gradient;
};

export const getAccentEffects = (theme) => {
  if (accentEffectsCache.has(theme)) return accentEffectsCache.get(theme);
  const isDark = theme.palette.mode === 'dark';
  const main = theme.palette.primary.main;
  const accent = theme.palette.secondary.main;
  const gradient = isDark
    ? `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.92)}, ${alpha(accent, 0.82)})`
    : `linear-gradient(135deg, ${main}, ${alpha(accent, 0.85)})`;

  const effects = isDark
    ? {
        gradient,
        textGradient: gradient,
        glow: `0 0 24px ${alpha(main, 0.22)}, 0 0 46px ${alpha(accent, 0.14)}`,
        border: `1px solid ${alpha(main, 0.22)}`,
        background: alpha(main, 0.1),
      }
    : {
        gradient,
        textGradient: gradient,
        glow: `0 8px 28px ${alpha(main, 0.18)}`,
        border: `1px solid ${alpha(main, 0.16)}`,
        background: alpha(main, 0.07),
      };

  const frozen = Object.freeze(effects);
  accentEffectsCache.set(theme, frozen);
  return frozen;
};

