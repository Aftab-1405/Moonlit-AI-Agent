import { Box, CircularProgress, IconButton, MenuList, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { memo, useEffect, useRef, useState } from 'react';
import { AppPopover, AppPopoverItem } from '@/components';
import { CloseIcon, FullscreenEnterIcon, FullscreenExitIcon, MoreIcon } from '@/components/icons';
import {
  ARTIFACT_ROOT_SX,
  getArtifactActionButtonSx,
  useArtifactActions,
} from '@/features/sidebar-right/artifact-loader/artifactLayoutUtils';
import { getAppDividerColor } from '@/features/styles/interfaceChrome';
import { getScrollbarStyles } from '@/styles/shared';

/**
 * ArtifactLayout — chrome primitives for the right-side artifact panel.
 *
 * Provides:
 *   - `ArtifactShell`         — full-panel wrapper (header + body + footer)
 *   - `ArtifactHeader`        — title + subtitle + actions row
 *   - `ArtifactToolbar`       — secondary controls row below the header
 *   - `ArtifactBody`          — scrollable content area
 *   - `ArtifactCanvasPanel`   — clipped canvas surface
 *   - `ArtifactUtilityPanel`  — clipped raised utility surface
 *   - `ArtifactPanelOverlay`  — inherited surface for loading/errors
 *   - `ArtifactFooter`        — optional bottom action bar
 *   - `ArtifactEmptyState`    — centred placeholder for empty / error states
 *
 * The shared header has no divider. Panel geometry and surface roles live here;
 * renderers own their content, not independent card treatments.
 */

function getArtifactBarSx(theme) {
  return {
    borderColor: getAppDividerColor(theme),
    bgcolor: 'background.default',
    backgroundImage: 'none',
  };
}

// Panel geometry belongs here; renderers supply only content and sizing.
function ArtifactPanel({ children, sx = [], ...props }) {
  return (
    <Box
      {...props}
      sx={[
        {
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxSizing: 'border-box',
          overflow: 'hidden',
          isolation: 'isolate',
          borderRadius: (theme) => `${theme.shape.radius.artifactPanel}px`,
          border: '1px solid',
          borderColor: 'border.subtle',
          boxShadow: 'none',
          backgroundImage: 'none',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}

export function ArtifactCanvasPanel({ sx = [], ...props }) {
  return (
    <ArtifactPanel
      {...props}
      sx={[{ bgcolor: 'background.default' }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
}

export function ArtifactUtilityPanel({ sx = [], ...props }) {
  return (
    <ArtifactPanel
      {...props}
      sx={[{ bgcolor: 'background.paper' }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
}

export function ArtifactPanelOverlay({ children }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'inherit',
        borderRadius: 'inherit',
        overflow: 'hidden',
      }}
    >
      {children}
    </Box>
  );
}

export function ArtifactLoadingState({ title = 'Loading artifact' }) {
  return (
    <ArtifactEmptyState
      role="status"
      ariaLive="polite"
      title={title}
      icon={<CircularProgress size={28} sx={{ color: 'text.secondary' }} />}
    />
  );
}

function ArtifactActionButton({
  label,
  icon,
  onClick,
  disabled = false,
  active,
  size = 36,
  menuOpen,
}) {
  const theme = useTheme();

  return (
    <Tooltip title={label}>
      <span style={{ display: 'inline-flex' }}>
        <IconButton
          size="small"
          aria-label={label}
          aria-pressed={active}
          aria-haspopup={menuOpen === undefined ? undefined : 'menu'}
          aria-expanded={menuOpen}
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

  if (!children) return null;

  return (
    <Box
      sx={{
        flexShrink: 0,
        p: 1,
        borderBottom: '1px solid',
        ...getArtifactBarSx(theme),
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function ArtifactHeader({ icon, title, subtitle, actions, outputsSlot }) {
  const theme = useTheme();
  const headerRef = useRef(null);
  const [compact, setCompact] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const visibleActions = useArtifactActions(actions);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return undefined;
    const measure = () => {
      const width = header.getBoundingClientRect().width;
      if (width > 0) setCompact(width < 480);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const isOverflow = (action) =>
    action.placement === 'overflow' || (compact && action.placement !== 'persistent');
  const inlineActions = visibleActions.filter((action) => !isOverflow(action));
  const overflowActions = visibleActions.filter(isOverflow);

  return (
    <Box
      ref={headerRef}
      component="header"
      data-artifact-header
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        flexShrink: 0,
        minHeight: { xs: 56, md: 52 },
        px: 1,
        ...getArtifactBarSx(theme),
      }}
    >
      {icon ? (
        <Box sx={{ display: 'flex', color: 'text.secondary', flexShrink: 0 }}>{icon}</Box>
      ) : null}
      <Box sx={{ flex: 1, minWidth: 0, px: 0.5 }}>
        <Typography
          component="h2"
          title={title}
          noWrap
          sx={{ ...theme.typography.uiBodyMd, fontWeight: 400, color: 'text.primary' }}
        >
          {title}
        </Typography>
        {subtitle ? (
          <Typography noWrap sx={{ ...theme.typography.uiCaptionSm, color: 'text.secondary' }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {outputsSlot}
      {inlineActions
        .filter((action) => action.placement !== 'persistent')
        .map(({ key, placement: _placement, ...action }) => (
          <ArtifactActionButton key={key || action.label} {...action} />
        ))}
      {overflowActions.length ? (
        <>
          <ArtifactActionButton
            menuOpen={Boolean(menuAnchor)}
            label="More artifact actions"
            icon={<MoreIcon />}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
          />
          <AppPopover
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            width={260}
          >
            <MenuList aria-label="Artifact actions" sx={{ p: 0 }}>
              {overflowActions.map((action) => (
                <AppPopoverItem
                  key={action.key || action.label}
                  label={action.label}
                  icon={action.icon}
                  disabled={action.disabled}
                  onClick={(event) => {
                    setMenuAnchor(null);
                    action.onClick?.(event);
                  }}
                />
              ))}
            </MenuList>
          </AppPopover>
        </>
      ) : null}
      {inlineActions
        .filter((action) => action.placement === 'persistent')
        .map(({ key, placement: _placement, ...action }) => (
          <ArtifactActionButton key={key || action.label} {...action} />
        ))}
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
        p: 1,
        display: 'flex',
        flexDirection: 'column',
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

  if (!children) return null;

  return (
    <Box
      sx={{
        flexShrink: 0,
        px: 1,
        py: 1,
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
  outputsSlot,
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
          placement: 'persistent',
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
          placement: 'persistent',
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
        <ArtifactHeader
          icon={icon}
          title={title}
          subtitle={subtitle}
          actions={shellActions}
          outputsSlot={outputsSlot}
        />
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
