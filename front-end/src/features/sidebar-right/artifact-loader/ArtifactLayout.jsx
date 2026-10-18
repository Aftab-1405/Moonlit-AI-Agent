import { Box, IconButton, Stack, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { memo } from 'react';
import { CloseIcon, FullscreenEnterIcon, FullscreenExitIcon } from '@/components/icons';
import {
  ARTIFACT_ROOT_SX,
  getArtifactActionButtonSx,
  useArtifactActions,
} from '@/features/sidebar-right/artifact-loader/artifactLayoutUtils';
import { getAppBarSurfaceSx, getAppDividerColor } from '@/features/styles/interfaceChrome';
import { getScrollbarStyles } from '@/styles/shared';

/**
 * ArtifactLayout — chrome primitives for the right-side artifact panel.
 *
 * Provides:
 *   - `ArtifactShell`         — full-panel wrapper (header + body + footer)
 *   - `ArtifactHeader`        — title + subtitle + actions row
 *   - `ArtifactToolbar`       — secondary controls row below the header
 *   - `ArtifactBody`          — scrollable content area
 *   - `ArtifactFooter`        — optional bottom action bar
 *   - `ArtifactEmptyState`    — centred placeholder for empty / error states
 *
 * All sections share the same divider colour (`getAppDividerColor`) and
 * surface treatment (`getAppBarSurfaceSx`) so the panel reads as one
 * cohesive surface rather than a stack of disconnected cards.
 */

function getArtifactBarSx(theme) {
  return {
    borderColor: getAppDividerColor(theme),
    ...getAppBarSurfaceSx(theme),
  };
}

function ArtifactActionButton({
  label,
  icon,
  onClick,
  disabled = false,
  active,
  size = 36,
}) {
  const theme = useTheme();

  return (
    <Tooltip title={label}>
      <span style={{ display: 'inline-flex' }}>
        <IconButton
          size="small"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          disabled={disabled}
          sx={getArtifactActionButtonSx(theme, { active, size })}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}

function ArtifactToolbar({ children, sx = {} }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (!children) return null;

  return (
    <Box
      sx={{
        flexShrink: 0,
        p: isMobile ? 1.5 : 2,
        borderBottom: '1px solid',
        ...getArtifactBarSx(theme),
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function ArtifactHeader({ icon, title, subtitle, actions, sx = {} }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const visibleActions = useArtifactActions(actions);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        flexShrink: 0,
        p: isMobile ? 1.5 : 2,
        borderBottom: '1px solid',
        ...getArtifactBarSx(theme),
        ...sx,
      }}
    >
      <Stack direction="row" alignItems="center" gap={1} minWidth={0} flex={1}>
        {icon ? (
          <Box
            sx={{
              width: 30,
              height: 30,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        ) : null}
        <Box sx={{ minWidth: 0 }}>
          <Typography
            noWrap
            sx={{
              ...theme.typography.uiBodyMd,
              fontWeight: 400,
              color: 'text.primary',
              lineHeight: 1.35,
            }}
          >
            {title}
          </Typography>
          {subtitle ? (
            <Typography
              noWrap
              sx={{
                ...theme.typography.uiCaptionSm,
                color: 'text.secondary',
                mt: 0.25,
                display: { xs: 'none', sm: 'block' },
              }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Stack>

      {visibleActions.length ? (
        <Stack
          direction="row"
          alignItems="center"
          gap={0.5}
          flexShrink={0}
          flexWrap="wrap"
          justifyContent="flex-end"
        >
          {visibleActions.map(({ key, ...actionProps }) => (
            <ArtifactActionButton key={key || actionProps.label} {...actionProps} />
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}

function ArtifactBody({ children, component = 'div', scroll = 'auto', sx = {} }) {
  const theme = useTheme();

  return (
    <Box
      component={component}
      sx={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: scroll,
        ...getScrollbarStyles(theme),
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function ArtifactFooter({ children, sx = {} }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (!children) return null;

  return (
    <Box
      sx={{
        flexShrink: 0,
        px: isMobile ? 1.5 : 2,
        py: 1.5,
        borderTop: '1px solid',
        ...getArtifactBarSx(theme),
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

export function ArtifactEmptyState({
  icon,
  title = 'Nothing to display',
  message,
  role,
  ariaLive,
  sx = {},
}) {
  const theme = useTheme();

  return (
    <Box
      role={role}
      aria-live={ariaLive}
      aria-atomic={ariaLive ? 'true' : undefined}
      sx={{
        ...ARTIFACT_ROOT_SX,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        p: 4,
        textAlign: 'center',
        color: 'text.secondary',
        ...sx,
      }}
    >
      {icon ? (
        <Box
          sx={{
            display: 'flex',
            color: 'text.secondary',
          }}
        >
          {icon}
        </Box>
      ) : null}
      <Typography sx={{ ...theme.typography.uiBodyMd, color: 'text.secondary', fontWeight: 400 }}>
        {title}
      </Typography>
      {message ? (
        <Typography
          sx={{ ...theme.typography.uiCaptionMd, color: 'text.secondary', maxWidth: 360 }}
        >
          {message}
        </Typography>
      ) : null}
    </Box>
  );
}

function ArtifactShell({
  title,
  subtitle,
  icon,
  chrome = 'standalone',
  onClose,
  onRequestClose,
  _workspaceContainerRef,
  fullscreenMode = 'workspace',
  isFullscreen = false,
  onEnterFullscreen,
  onExitFullscreen,
  onToggleFullscreen,
  actions = [],
  controls,
  footer,
  children,
  bodyScroll = 'hidden',
  bodySx = {},
}) {
  const isStandalone = chrome === 'standalone';
  const requestClose = onRequestClose || onClose;
  const handleFullscreenClick = isFullscreen
    ? onExitFullscreen || onToggleFullscreen
    : onEnterFullscreen || onToggleFullscreen;

  const shellActions = useArtifactActions([
    ...actions,
    isStandalone && fullscreenMode === 'workspace' && handleFullscreenClick
      ? {
          key: 'fullscreen',
          label: isFullscreen ? 'Exit fullscreen' : 'Fullscreen',
          icon: isFullscreen ? (
            <FullscreenExitIcon sx={{ fontSize: 18 }} />
          ) : (
            <FullscreenEnterIcon sx={{ fontSize: 18 }} />
          ),
          onClick: handleFullscreenClick,
          active: isFullscreen,
        }
      : null,
    isStandalone && requestClose
      ? {
          key: 'close',
          label: 'Close artifact',
          icon: <CloseIcon sx={{ fontSize: 18 }} />,
          onClick: requestClose,
        }
      : null,
  ]);

  const panel = (
    <Box
      sx={{
        ...ARTIFACT_ROOT_SX,
        borderRadius: 0,
        border: 0,
        borderColor: 'transparent',
        // No surface paint here — the artifact column already painted it
        // (AppShell owns the column surface). Painting again would create a
        // redundant layer that interferes with theme switching.
        boxShadow: 'none',
      }}
    >
      {isStandalone ? (
        <ArtifactHeader icon={icon} title={title} subtitle={subtitle} actions={shellActions} />
      ) : null}
      {controls ? <ArtifactToolbar>{controls}</ArtifactToolbar> : null}
      <ArtifactBody scroll={bodyScroll} sx={bodySx}>
        {children}
      </ArtifactBody>
      {footer ? <ArtifactFooter>{footer}</ArtifactFooter> : null}
    </Box>
  );

  const shell = isStandalone ? (
    <Box
      sx={{
        ...ARTIFACT_ROOT_SX,
        boxSizing: 'border-box',
      }}
    >
      {panel}
    </Box>
  ) : (
    panel
  );

  return shell;
}

export default memo(ArtifactShell);
