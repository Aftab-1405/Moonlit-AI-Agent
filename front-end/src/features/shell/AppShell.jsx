import { Box, useTheme } from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';
import { memo, useMemo } from 'react';
import {
  getArtifactPanelChromeSx,
  getShellWorkspaceSx,
  getSidebarChromeSx,
} from '@/features/styles/interfaceChrome';
import { UI_LAYOUT, UI_Z_INDEX } from '@/styles/shared';
import { getAppShellLayout } from './appShellModel';

const MotionDiv = motion.div;
const SPRING_TRANSITION = { type: 'spring', stiffness: 320, damping: 32 };
const NO_TRANSITION = { duration: 0 };

function AppShell({
  sidebarSlot,
  chatSlot,
  workspaceSlot,
  isNarrowLayout,
  sidebarOpen,
  canvasOpen,
  canvasWidth,
  canvasFullscreen = false,
  isResizingCanvas,
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const chatCovered = canvasOpen && (canvasFullscreen || isNarrowLayout);
  const layout = getAppShellLayout(
    { isNarrowLayout, sidebarOpen, canvasOpen, canvasWidth },
    {
      expanded: UI_LAYOUT.sidebarExpandedWidth,
      collapsed: UI_LAYOUT.sidebarCollapsedWidth,
    },
  );

  const sidebarColumnSx = useMemo(
    () => ({
      width: isNarrowLayout ? 0 : layout.sidebarWidth,
      height: '100%',
      minWidth: 0,
      minHeight: 0,
      overflow: 'visible',
      ...getSidebarChromeSx(theme),
    }),
    [isNarrowLayout, layout.sidebarWidth, theme],
  );

  const chatColumnSx = useMemo(
    () => ({
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      minHeight: 0,
      overflow: 'hidden',
      position: 'relative',
      zIndex: UI_Z_INDEX.mainContentBase,
      ...getShellWorkspaceSx(theme),
    }),
    [theme],
  );

  const workspaceSurfaceSx = useMemo(
    () => ({
      width: 'calc(100% - 8px)',
      height: 'calc(100% - 8px)',
      m: 0.5,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxSizing: 'border-box',
      ...getArtifactPanelChromeSx(theme),
    }),
    [theme],
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
        // One backdrop shows through every rounded card's corners and gutters.
        bgcolor: 'background.shell',
      }}
    >
      <MotionDiv
        initial={false}
        animate={{ width: layout.sidebarWidth }}
        transition={reduceMotion ? NO_TRANSITION : SPRING_TRANSITION}
        style={{
          flexShrink: 0,
          height: '100%',
          position: 'relative',
          zIndex: 2,
          overflow: 'visible',
        }}
      >
        <Box data-column="sidebar" aria-label="Sidebar column" sx={sidebarColumnSx}>
          {sidebarSlot}
        </Box>
      </MotionDiv>

      <Box
        component="main"
        id="main-content"
        aria-label="Chat workspace"
        aria-hidden={chatCovered || undefined}
        inert={chatCovered ? true : undefined}
        sx={{ ...chatColumnSx, display: canvasOpen && canvasFullscreen ? 'none' : 'flex' }}
      >
        {chatSlot}
      </Box>

      <MotionDiv
        initial={false}
        animate={
          isNarrowLayout
            ? { width: '100%', y: layout.workspaceY }
            : {
                width:
                  canvasOpen && canvasFullscreen
                    ? `calc(100% - ${layout.sidebarWidth}px)`
                    : layout.workspaceWidth,
                y: 0,
              }
        }
        transition={isResizingCanvas || reduceMotion ? NO_TRANSITION : SPRING_TRANSITION}
        aria-hidden={!canvasOpen}
        inert={!canvasOpen ? true : undefined}
        style={{
          position: layout.workspacePosition,
          ...(isNarrowLayout ? { inset: 0 } : {}),
          zIndex: isNarrowLayout ? UI_Z_INDEX.artifactFullscreen : 1,
          flexShrink: 0,
          maxWidth:
            isNarrowLayout || canvasFullscreen
              ? undefined
              : `max(calc((100% - ${layout.sidebarWidth}px) / 2), calc(100% - ${layout.sidebarWidth}px - 360px))`,
          height: '100%',
          overflow: 'hidden',
          boxSizing: 'border-box',
          pointerEvents: layout.workspaceInteractive ? 'auto' : 'none',
        }}
      >
        <Box
          component="section"
          data-column="workspace"
          data-ui-target="workspace_canvas"
          aria-label="Workspace canvas"
          sx={workspaceSurfaceSx}
        >
          {workspaceSlot}
        </Box>
      </MotionDiv>
    </Box>
  );
}

export default memo(AppShell);
