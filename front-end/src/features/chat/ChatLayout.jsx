import { Box, useTheme } from '@mui/material';
import { memo } from 'react';
import { getChatStageLayoutSx } from '@/features/styles/interfaceChrome';
import { getScrollbarStyles, UI_LAYOUT } from '@/styles/shared';

// Layout owns surfaces, placement and scrolling; slots own feature behavior.
// Keep each slot at a stable tree position when welcome/active placement changes.
const ChatLayout = memo(function ChatLayout({
  header,
  outputs,
  welcome,
  composer,
  suggestions,
  children,
  placement = 'active',
  transcriptVisible = true,
  scrollContainerRef,
}) {
  const theme = useTheme();
  const stageLayout = getChatStageLayoutSx(placement);
  const hasOutputs = Boolean(outputs);

  return (
    <Box
      sx={{
        position: 'relative',
        zIndex: 1,
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        contain: 'paint style',
        containerType: 'inline-size',
      }}
    >
      {header}
      {hasOutputs && (
        <Box
          sx={{
            position: 'absolute',
            top: {
              xs: 58,
              md: UI_LAYOUT.workspaceTopRowHeight - 2 * UI_LAYOUT.workspaceFrameBorderWidth + 10,
            },
            right: 8,
            width: 300,
            zIndex: 3,
          }}
        >
          {outputs}
        </Box>
      )}
      <Box
        data-chat-placement={placement}
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          mr: hasOutputs ? '316px' : 0,
          '@container (min-width: 1440px)': { mr: 0 },
          gridTemplateRows: stageLayout.gridTemplateRows,
          transition: stageLayout.transition,
          'html[data-moonlit-reduced-motion="true"] &': stageLayout.reducedMotion,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            ...stageLayout.transcript,
            gridColumn: 1,
            minWidth: 0,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {welcome}

          <Box
            ref={scrollContainerRef}
            data-chat-scroll-container=""
            aria-hidden={!transcriptVisible || undefined}
            sx={{
              position: 'absolute',
              inset: 0,
              visibility: transcriptVisible ? 'visible' : 'hidden',
              pointerEvents: transcriptVisible ? 'auto' : 'none',
              overflowY: 'auto',
              overflowX: 'hidden',
              px: { xs: 1.25, sm: 2 },
              pt: { xs: 1, sm: 2 },
              pb: { xs: 1, sm: 2 },
              ...getScrollbarStyles(theme),
            }}
          >
            {children}
          </Box>
        </Box>

        <Box
          sx={{
            gridColumn: 1,
            gridRow: stageLayout.composer.gridRow,
            position: 'relative',
            zIndex: 4,
            minWidth: 0,
          }}
        >
          <Box sx={{ position: 'relative', px: { xs: 1.25, sm: 2 }, pt: { xs: 1, sm: 1.5 } }}>
            {composer}
          </Box>
        </Box>

        <Box sx={{ gridColumn: 1, gridRow: 3, minHeight: 0, overflowY: 'auto', px: 2 }}>
          {suggestions}
        </Box>
      </Box>
    </Box>
  );
});

export default ChatLayout;
