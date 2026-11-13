import { useAppearanceReducedMotion } from '@/hooks/useAppearanceReducedMotion';
import { Box, useTheme } from '@mui/material';
import { motion } from 'framer-motion';
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
  settingsOpen = false,
}) {
  const theme = useTheme();
  const reduceMotion = useAppearanceReducedMotion();
  const chatCovered = settingsOpen || (canvasOpen && (canvasFullscreen || isNarrowLayout));
  const layout = getAppShellLayout(
    { isNarrowLayout, sidebarOpen: sidebarOpen && !settingsOpen, canvasOpen, canvasWidth },
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
      <Box
        style={{
          width: layout.sidebarWidth,
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
      </Box>

      <Box
        component="main"
        id="main-content"
        aria-label="Chat workspace"
        aria-hidden={chatCovered || undefined}
        inert={chatCovered ? true : undefined}
        sx={{
          ...chatColumnSx,
          display: settingsOpen || (canvasOpen && canvasFullscreen) ? 'none' : 'flex',
        }}
      >
        {chatSlot}
      </Box>

      <MotionDiv
        initial={false}
        animate={
          isNarrowLayout
            ? { y: layout.workspaceY, opacity: 1 }
            : { y: 0, opacity: canvasOpen ? 1 : 0 }
        }
        transition={isResizingCanvas || reduceMotion ? NO_TRANSITION : SPRING_TRANSITION}
        aria-hidden={settingsOpen || !canvasOpen}
        inert={settingsOpen || !canvasOpen ? true : undefined}
        style={{
          display: settingsOpen ? 'none' : undefined,
          // Commit geometry once; animate only compositor-friendly properties.
          // This also avoids repeatedly resizing SQL editors and result grids.
          width:
            canvasOpen && canvasFullscreen && !isNarrowLayout
              ? `calc(100% - ${layout.sidebarWidth}px)`
              : layout.workspaceWidth,
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
