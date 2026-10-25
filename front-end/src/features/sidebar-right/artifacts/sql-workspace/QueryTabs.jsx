import { Box, Button, IconButton, Tooltip } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { memo, useRef } from 'react';
import {
  AddIcon,
  CloseIcon,
  CodeEditorIcon,
  SidebarPanelIcon,
  UnsavedIcon,
} from '@/components/icons';
import { getArtifactActionButtonSx } from '@/features/sidebar-right/artifact-loader';
import { HOVER_CAPABLE_QUERY, TOUCH_DEVICE_QUERY } from '@/styles/mediaQueries';
import { getInteractionColors, getScrollbarStyles } from '@/styles/shared';

const TAB_HEIGHT = 28;
const TAB_MIN_WIDTH = 86;
const TAB_MAX_WIDTH = 156;

function getTabSx(theme, active) {
  const interaction = getInteractionColors(theme, { active });
  const activeBackground = theme.palette.action.selected;
  const activeHoverBackground = theme.palette.layer.medium;

  return {
    height: { xs: 44, md: TAB_HEIGHT },
    minHeight: { xs: 44, md: TAB_HEIGHT },
    minWidth: TAB_MIN_WIDTH,
    maxWidth: TAB_MAX_WIDTH,
    flex: '0 1 auto',
    px: { xs: 1.5, md: 1 },
    py: 0,
    gap: 0.5,
    border: 0,
    borderRadius: theme.shape.radius.pill,
    textTransform: 'none',
    color: active ? 'text.primary' : 'text.secondary',
    bgcolor: active ? activeBackground : 'transparent',
    boxShadow: 'none',
    transition: theme.transitions.create(['background-color', 'color'], {
      duration: theme.transitions.duration.shorter,
    }),
    '&:hover': {
      color: 'text.primary',
      bgcolor: active ? activeHoverBackground : interaction.hoverBackground,
    },
    '&.Mui-focusVisible': {
      outline: `2px solid ${interaction.focusRing}`,
      outlineOffset: -2,
    },
  };
}

function QueryTabs({
  tabs,
  activeTabId,
  onTabChange,
  onTabAdd,
  onTabClose,
  onToggleSidebar,
  schemaSidebarOpen,
}) {
  const theme = useTheme();
  const interaction = getInteractionColors(theme);
  const tabRefs = useRef(new Map());

  const handleTabKeyDown = (event, index) => {
    const direction = theme.direction === 'rtl' ? -1 : 1;
    let next;
    if (event.key === 'ArrowRight') next = (index + direction + tabs.length) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - direction + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const id = tabs[next].id;
    tabRefs.current.get(id)?.focus();
    onTabChange(id);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.625,
        px: 1.125,
        py: 0.875,
        bgcolor: 'transparent',
        flexShrink: 0,
        minHeight: 48,
      }}
    >
      {!schemaSidebarOpen && (
        <Tooltip title="Show schema explorer">
          <IconButton
            size="small"
            onClick={onToggleSidebar}
            aria-label="Show schema explorer"
            sx={getArtifactActionButtonSx(theme, { size: 32 })}
          >
            <SidebarPanelIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}

      <Box
        role="tablist"
        aria-label="SQL query tabs"
        aria-orientation="horizontal"
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          gap: 0.5,
          overflowX: 'auto',
          overflowY: 'hidden',
          flexWrap: 'nowrap',
          p: 0,
          ...getScrollbarStyles(theme),
          '& .sql-query-tab': {
            ...theme.typography.uiCaptionXs,
          },
        }}
      >
        {tabs.map((tab, index) => {
          const active = activeTabId === tab.id;
          return (
            <Box
              key={tab.id}
              className="sql-query-tab-item"
              sx={{
                display: 'flex',
                alignItems: 'center',
                flex: '0 0 auto',
                minWidth: 0,
                gap: 0.25,
              }}
            >
              <Button
                type="button"
                id={`sql-query-tab-${tab.id}`}
                className="sql-query-tab"
                role="tab"
                tabIndex={active ? 0 : -1}
                ref={(node) => {
                  if (node) tabRefs.current.set(tab.id, node);
                  else tabRefs.current.delete(tab.id);
                }}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                aria-selected={active}
                aria-controls={active ? `sql-query-panel-${tab.id}` : undefined}
                aria-label={tab.title}
                onClick={() => onTabChange(tab.id)}
                sx={getTabSx(theme, active)}
              >
                <CodeEditorIcon
                  sx={{
                    width: 13,
                    height: 13,
                    flexShrink: 0,
                    color: active ? 'text.primary' : 'text.disabled',
                  }}
                />
                <Box
                  component="span"
                  sx={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                  }}
                >
                  {tab.title}
                </Box>
                {tab.isDirty && (
                  <UnsavedIcon sx={{ fontSize: 7, color: 'text.primary', flexShrink: 0 }} />
                )}
              </Button>
              {tabs.length > 1 && (
                <Tooltip title="Close query">
                  <IconButton
                    type="button"
                    aria-label={`Close ${tab.title}`}
                    onClick={() => onTabClose(tab.id)}
                    sx={{
                      ...getArtifactActionButtonSx(theme, { size: 28 }),
                      color: theme.palette.text.disabled,
                      opacity: 0,
                      transition: theme.transitions.create(
                        ['background-color', 'color', 'opacity'],
                        {
                          duration: theme.transitions.duration.shorter,
                        },
                      ),
                      [HOVER_CAPABLE_QUERY]: {
                        '.sql-query-tab-item:hover &': { opacity: 1 },
                        '&:hover': {
                          color: interaction.hoverColor,
                          bgcolor: interaction.hoverBackground,
                        },
                      },
                      '&:focus-visible': {
                        opacity: 1,
                        color: interaction.hoverColor,
                        bgcolor: interaction.hoverBackground,
                        outline: `2px solid ${interaction.focusRing}`,
                        outlineOffset: 1,
                      },
                      [TOUCH_DEVICE_QUERY]: { opacity: 1 },
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        })}
      </Box>

      <Tooltip title="Create new query">
        <IconButton
          size="small"
          onClick={onTabAdd}
          aria-label="Create new query"
          sx={{
            ...getArtifactActionButtonSx(theme, { size: 32 }),
            color: 'text.primary',
            bgcolor: alpha(theme.palette.text.primary, theme.palette.opacity.subtle),
          }}
        >
          <AddIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default memo(QueryTabs);
