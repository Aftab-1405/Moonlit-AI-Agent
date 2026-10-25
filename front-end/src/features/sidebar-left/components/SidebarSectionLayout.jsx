import { Box } from '@mui/material';
import { REDUCED_MOTION_QUERY } from '@/styles/mediaQueries';
import { getScrollbarStyles } from '@/styles/shared';

export function SidebarSkeleton({ width = '100%', height = 12, circular = false }) {
  return (
    <Box
      aria-hidden="true"
      data-sidebar-skeleton=""
      sx={{
        width,
        height,
        maxWidth: '100%',
        flexShrink: 0,
        borderRadius: circular ? '50%' : '4px',
        bgcolor: 'action.hover',
        animation: 'sidebarPulse 1.6s ease-in-out infinite',
        '@keyframes sidebarPulse': { '0%, 100%': { opacity: 0.45 }, '50%': { opacity: 1 } },
        [REDUCED_MOTION_QUERY]: { animation: 'none' },
      }}
    />
  );
}

export function LoadingStatus({ children }) {
  return (
    <Box
      role="status"
      sx={{
        position: 'absolute',
        width: 1,
        height: 1,
        p: 0,
        m: -1,
        overflow: 'hidden',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

export default function SidebarSectionLayout({ children, footer, busy = false, label }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        px: 2,
        pb: 2,
        gap: 2,
        boxSizing: 'border-box',
      }}
    >
      <Box
        aria-busy={busy || undefined}
        aria-label={label}
        sx={(theme) => ({
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          scrollbarGutter: 'stable',
          ...getScrollbarStyles(theme),
        })}
      >
        {children}
      </Box>
      {footer && (
        <Box sx={{ flexShrink: 0, '& > .MuiButton-root': { width: '100%', minHeight: 40 } }}>
          {footer}
        </Box>
      )}
    </Box>
  );
}
