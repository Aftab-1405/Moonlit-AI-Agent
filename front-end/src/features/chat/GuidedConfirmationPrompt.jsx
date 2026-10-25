// GuidedConfirmationPrompt — compact "Task Paused" strip that slides UP from
// behind the composer, overlaying the chat instead of pushing it.
//
// Used for agent interrupts (e.g. "execute_query") and step-limit pauses.
// Design goals:
//   1. No layout shift — the banner is absolutely positioned over the chat,
//      so chat messages don't jump when it appears.
//   2. Compact single-line text ("⏸ Step limit reached · 5 steps used") —
//      the buttons speak for themselves.
//   3. Slides up from behind the composer's top edge (translateY animation).
//   4. Composer stays fully interactive (zIndex above the banner).
//   5. A subtle gradient fade at the banner's top edge so the chat content
//      behind it fades out gracefully.
//
// Layering:
//   - Banner zIndex: 3  (above chat messages, below composer)
//   - Composer zIndex: 4 (always on top, always interactive)

import { Box, Button, Collapse, Fade, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { memo } from 'react';
import { getAppPanelSurfaceSx } from '@/features/styles/interfaceChrome';
import { UI_LAYOUT } from '@/styles/shared';

const GuidedConfirmationPrompt = memo(function GuidedConfirmationPrompt({
  open,
  title,
  message,
  confirmText,
  cancelText,
  onCancel,
  onConfirm,
  theme,
}) {
  const compactMessage = message || 'Task paused';

  return (
    <Collapse
      in={open}
      timeout={250}
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '100%',
        zIndex: 3,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <Fade in={open} timeout={250}>
        <Box
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={title ? `${title}: ${compactMessage}` : compactMessage}
          sx={{
            width: '100%',
            maxWidth: UI_LAYOUT.chatInputMaxWidth,
            mx: 'auto',
            px: { xs: 1, sm: 0 },
            transform: open ? 'translateY(0)' : 'translateY(8px)',
            transition: theme.transitions.create(['transform', 'opacity'], {
              duration: 250,
              easing: theme.transitions.easing.easeOut,
            }),
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: { xs: 'stretch', md: 'center' },
              justifyContent: 'space-between',
              gap: { xs: 1, md: 1.5 },
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
              border: '1px solid',
              borderColor: alpha(
                theme.palette.warning.main,
                theme.palette.opacity.statusBorderSelected,
              ),
              borderBottom: 0,
              ...getAppPanelSurfaceSx(theme),
              px: { xs: 2, md: 2.5 },
              py: 1,
              bgcolor: (th) => alpha(th.palette.warning.main, th.palette.opacity.soft),
              boxShadow: 'none',
            }}
          >
            {/* Compact single-line message with icon */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Box
                aria-hidden
                component="span"
                sx={{
                  fontSize: 14,
                  lineHeight: 1,
                  flexShrink: 0,
                  color: 'warning.main',
                }}
              >
                ⏸
              </Box>
              <Typography
                sx={{
                  ...theme.typography.uiBodySm,
                  color: 'text.primary',
                  fontWeight: 400,
                  lineHeight: 1.3,
                  overflowWrap: 'anywhere',
                  maxHeight: '2.6em',
                  overflow: 'hidden',
                }}
              >
                {compactMessage}
              </Typography>
            </Box>

            {/* Action buttons — compact, single row */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexShrink: 0,
                alignSelf: { xs: 'flex-end', md: 'center' },
              }}
            >
              <Button size="small" onClick={onCancel}>
                {cancelText || 'Stop'}
              </Button>
              <Button size="small" variant="contained" color="accent" onClick={onConfirm}>
                {confirmText || 'Continue'}
              </Button>
            </Box>
          </Box>
        </Box>
      </Fade>
    </Collapse>
  );
});

export default GuidedConfirmationPrompt;
