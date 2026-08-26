/**
 * ChatInput — the message composer at the bottom of the chat workspace.
 *
 * Layout:
 *   ┌────────────────────────────────────────────┐
 *   │  multiline text field                       │
 *   ├────────────────────────────────────────────┤
 *   │  [Context] [SQL]                [Model] [→] │
 *   └────────────────────────────────────────────┘
 *
 * Features:
 *   - Enter sends; Shift+Enter inserts newline.
 *   - Toolbar buttons open AppPopover menus for database/schema/model selection.
 *   - Context-usage ring on the model button when `usageMetrics` is provided.
 *   - Streaming state: send button becomes stop; input is disabled.
 *   - Mobile: controls preserve 44px touch targets and remain horizontally
 *     scrollable when space is constrained.
 *
 * The composer surface uses `getComposerSurfaceSx` as the single source of
 * truth for its resting and focus interaction hierarchy.
 */

import {
  Box,
  Button,
  IconButton,
  LinearProgress,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppPopover,
  AppPopoverEmptyState,
  AppPopoverItem,
  AppPopoverList,
  AppPopoverSectionLabel,
} from '@/components';
import {
  AddIcon,
  CheckIcon,
  CodeEditorIcon,
  DatabaseIcon,
  ExpandMoreIcon,
  SchemaIcon,
  SendIcon,
  StopIcon,
} from '@/components/icons';
import { getContextUsage } from '@/features/chat/contextUsage';
import SlashCommandMenu from '@/features/chat/SlashCommandMenu';
import { extractSlashQuery } from '@/features/chat/slashCommandUtils';
import {
  COMPOSER_MAX_WIDTH,
  getComposerLayoutSx,
  getComposerSurfaceSx,
  getResponsivePillControlSx,
  getResponsivePillIconButtonSx,
} from '@/features/styles/interfaceChrome';
import { HOVER_CAPABLE_QUERY } from '@/styles/mediaQueries';
import { getInteractionColors, getPopoverDividerSx, UI_LAYOUT, UI_POPOVER } from '@/styles/shared';
import logger from '@/utils/logger';

const ContextProgressRing = ({ value, theme }) => {
  if (value == null || value < 70) return null;
  const ratio = Math.min(1, Math.max(0, value) / 100);
  const radius = 7;
  const strokeWidth = 2.2;
  const size = 18;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ratio * circumference;

  let color = theme.palette.text.secondary;
  if (ratio > 0.9) {
    color = theme.palette.error.main;
  } else if (ratio > 0.75) {
    color = theme.palette.warning.main;
  }

  return (
    <Box
      component="svg"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      sx={{
        transform: 'rotate(-90deg)',
        transformOrigin: 'center',
        flexShrink: 0,
        display: 'block',
      }}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="transparent"
        stroke={alpha(theme.palette.text.primary, 0.08)}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="transparent"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        style={{
          transition: 'stroke-dashoffset 0.35s ease-in-out',
        }}
      />
    </Box>
  );
};

const ModelSelectorLabel = memo(function ModelSelectorLabel({ label }) {
  const viewportRef = useRef(null);
  const textRef = useRef(null);
  const [overflowWidth, setOverflowWidth] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) return undefined;

    const measureOverflow = () => {
      const nextOverflow = Math.max(0, Math.ceil(text.scrollWidth - viewport.clientWidth));
      setOverflowWidth((currentOverflow) =>
        currentOverflow === nextOverflow ? currentOverflow : nextOverflow,
      );
    };

    measureOverflow();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const resizeObserver = new ResizeObserver(measureOverflow);
    resizeObserver.observe(viewport);
    resizeObserver.observe(text);
    return () => resizeObserver.disconnect();
  }, []);

  const travelDuration = Math.min(5000, Math.max(1200, overflowWidth * 25));

  return (
    <Box
      ref={viewportRef}
      component="span"
      className="model-selector-label"
      sx={{
        minWidth: 0,
        flex: 1,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textAlign: 'left',
        '--model-label-overflow': `${overflowWidth}px`,
        '--model-label-duration': `${travelDuration}ms`,
      }}
    >
      <Box
        ref={textRef}
        component="span"
        className="model-selector-label-text"
        sx={{
          display: 'inline-block',
          minWidth: 'max-content',
          whiteSpace: 'nowrap',
          transform: 'translateX(0)',
          transition: 'transform 180ms ease-out',
        }}
      >
        {label}
      </Box>
    </Box>
  );
});

const ContextUsageBar = ({ label, value, color }) => (
  <Box>
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        mb: 0.5,
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 400 }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ opacity: 0.78 }}>
        {Math.round(value)}%
      </Typography>
    </Box>
    <LinearProgress
      variant="determinate"
      value={value}
      color={color}
      sx={{
        height: 6,
        borderRadius: '9999px',
        bgcolor: 'background.default',
      }}
    />
  </Box>
);

const getUsageColor = (value) => {
  if (value > 90) return 'error';
  if (value > 75) return 'warning';
  return 'primary';
};

const ContextUsageTooltip = ({ contextUsage, selectedModel }) => (
  <Box sx={{ width: 252, p: 0.5 }}>
    <Typography variant="body2" sx={{ fontWeight: 400, color: 'inherit', mb: 0.5 }}>
      {selectedModel || 'Select model'}
    </Typography>
    <Box sx={{ display: 'grid', gap: 1.25, mt: 1.5, mb: 1 }}>
      <ContextUsageBar
        label={contextUsage.contextPhase === 'pre_summary' ? 'Summary Trigger' : 'Active Context'}
        value={contextUsage.activePercent}
        color={getUsageColor(contextUsage.activePercent)}
      />
      {contextUsage.modelPercent != null && (
        <ContextUsageBar
          label="Model Capacity"
          value={contextUsage.modelPercent}
          color={getUsageColor(contextUsage.modelPercent)}
        />
      )}
    </Box>
    <Typography
      variant="caption"
      display="block"
      sx={{ color: 'text.secondary', mt: 1, fontSize: '10px', lineHeight: 1.25 }}
    >
      Background context manages these budgets to prevent memory crashes.
    </Typography>
  </Box>
);

function ChatInput({
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
  isConnected = false,
  dbType = null,
  currentDatabase = null,
  availableDatabases = [],
  availableSchemas = [],
  currentSchema = null,
  onSchemaChange,
  onDatabaseSwitch,
  selectedProvider = '',
  selectedModel = '',
  providerOptions = [],
  llmOptionsLoading = false,
  onSelectLlm,
  usageMetrics = null,
  // ENH [AUTO-TASK-MODE]: User's task-mode preference ('auto' | 'normal' |
  // 'tool_task' | 'long_task') and the backend-reported effective mode for
  // the current turn (null when not streaming / no turn yet).
  taskMode = 'auto',
  onTaskModeChange = null,
  effectiveTaskMode = null,
  onToggleSqlEditor = null,
  sqlEditorOpen = false,
  children,
}) {
  const [message, setMessage] = useState('');
  const theme = useTheme();
  const [contextAnchor, setContextAnchor] = useState(null);
  const [llmAnchor, setLlmAnchor] = useState(null);
  // ENH [SLASH-COMMAND]: Ref to the composer wrapper so the slash command
  // menu can anchor to it. The menu only opens when the message starts
  // with "/" — zero chrome at rest.
  const [composerElement, setComposerElement] = useState(null);

  const isPostgreSQL = useMemo(() => dbType?.toLowerCase() === 'postgresql', [dbType]);

  const connectionMetadataReady = useMemo(
    () => Boolean(isConnected && currentDatabase && dbType),
    [isConnected, currentDatabase, dbType],
  );
  const showSchemaSelector = useMemo(
    () => connectionMetadataReady && isPostgreSQL && Boolean(currentSchema),
    [connectionMetadataReady, isPostgreSQL, currentSchema],
  );
  const showDatabaseSelector = useMemo(() => connectionMetadataReady, [connectionMetadataReady]);

  const hasText = useMemo(() => message.trim().length > 0, [message]);

  const neutralInteraction = useMemo(() => getInteractionColors(theme), [theme]);
  const toolbarActionButtonStyles = useMemo(
    () => ({
      ...getResponsivePillControlSx(theme, {
        desktopHeight: 36,
        mobileHeight: UI_LAYOUT.touchTarget,
      }),
      minWidth: { xs: UI_LAYOUT.touchTarget, md: 32 },
      // Mobile toolbar buttons get a bit more breathing room so labels don't
      // truncate awkwardly. The previous `min(42vw, 152px)` was too tight —
      // even short labels like "public" got clipped.
      maxWidth: { xs: 'min(42vw, 168px)', md: 208 },
      flexShrink: 0,
      px: { xs: 1, md: 1.5 },
      py: 0,
      gap: 0.5,
      justifyContent: 'flex-start',
      color: 'text.secondary',
      backgroundColor: 'transparent',
      ...theme.typography.uiBodySm,
      lineHeight: 1,
      transition: theme.transitions.create(['background-color', 'color', 'transform'], {
        duration: theme.transitions.duration.shorter,
      }),
      '& .MuiButton-startIcon': {
        m: 0,
        mr: 0.5,
        color: 'text.disabled',
        flexShrink: 0,
        '& > *:nth-of-type(1)': {
          fontSize: 16,
        },
      },
      '& .MuiButton-endIcon': {
        m: 0,
        ml: 0.25,
        color: 'inherit',
        flexShrink: 0,
        opacity: 0.75,
        '& > *:nth-of-type(1)': {
          fontSize: 12,
        },
      },
      '& .MuiButton-iconSizeSmall': {
        '& > *:nth-of-type(1)': {
          fontSize: 16,
        },
      },
      '&:active': { transform: 'translateY(1px)' },
      '&[aria-expanded="true"]': {
        backgroundColor: neutralInteraction.activeBackground,
        color: 'text.primary',
      },
      '&[aria-pressed="true"]': {
        backgroundColor: neutralInteraction.activeBackground,
        color: 'text.primary',
        '& .MuiButton-startIcon': {
          color: 'text.primary',
        },
      },
      [HOVER_CAPABLE_QUERY]: {
        '&:hover': {
          backgroundColor: neutralInteraction.hoverBackground,
          color: 'text.primary',
          '& .MuiButton-startIcon': {
            color: 'text.primary',
          },
          '& .model-selector-label-text': {
            transform: 'translateX(calc(-1 * var(--model-label-overflow)))',
            transition: 'transform var(--model-label-duration) linear 300ms',
          },
        },
      },
      '&.Mui-focusVisible .model-selector-label-text': {
        transform: 'translateX(calc(-1 * var(--model-label-overflow)))',
        transition: 'transform var(--model-label-duration) linear 300ms',
      },
      '@media (prefers-reduced-motion: reduce)': {
        '&:hover .model-selector-label-text, &.Mui-focusVisible .model-selector-label-text': {
          transform: 'none',
          transition: 'none',
        },
      },
      // Visible focus ring for keyboard navigation — consistent with the rest of the app.
      '&.Mui-focusVisible': {
        outline: `2px solid ${theme.palette.border.focus}`,
        outlineOffset: 2,
      },
      '&.Mui-disabled': {
        opacity: 0.68,
        color: 'text.secondary',
        backgroundColor: 'transparent',
      },
    }),
    [neutralInteraction, theme],
  );

  const errorInteraction = useMemo(() => getInteractionColors(theme, { tone: 'error' }), [theme]);
  const inputSx = useMemo(
    () => ({
      '& .MuiInputBase-root': {
        p: 0,
        minHeight: { xs: 48, md: 50 },
        alignItems: 'flex-start',
      },
      '& .MuiInputBase-input': {
        py: 0.25,
        ...theme.typography.uiInput,
        lineHeight: 1.55,
        '&::placeholder': {
          color: 'text.secondary',
          opacity: 0.72,
        },
      },
    }),
    [theme],
  );
  const toolbarScrollSx = useMemo(
    () => ({
      display: 'flex',
      alignItems: 'center',
      gap: 0.5,
      minWidth: 0,
      flex: 1,
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollbarWidth: 'none',
      '&::-webkit-scrollbar': { display: 'none' },
    }),
    [],
  );
  const sendActionSx = useMemo(
    () => ({
      ...getResponsivePillIconButtonSx(theme, {
        desktopSize: 36,
        mobileSize: UI_LAYOUT.touchTarget,
      }),
      flexShrink: 0,
      // The ready-to-send state is a high-contrast monochrome action. Streaming
      // switches to the semantic error tone because the action becomes "stop".
      color: isStreaming
        ? theme.palette.error.main
        : hasText
          ? theme.palette.primary.contrastText
          : theme.palette.text.disabled,
      backgroundColor: isStreaming
        ? errorInteraction.activeBackground
        : hasText
          ? theme.palette.primary.main
          : theme.palette.action.hover,
      border: '1px solid',
      borderColor: isStreaming
        ? errorInteraction.border
        : hasText
          ? 'transparent'
          : theme.palette.border.idle,
      boxShadow: 'none',
      transition: theme.transitions.create(
        ['transform', 'background-color', 'color', 'box-shadow', 'border-color'],
        { duration: theme.transitions.duration.shorter },
      ),
      [HOVER_CAPABLE_QUERY]: {
        '&:hover': {
          transform: 'none',
          backgroundColor: isStreaming
            ? errorInteraction.activeHoverBackground
            : hasText
              ? theme.palette.primary.dark
              : theme.palette.action.selected,
          color: isStreaming
            ? theme.palette.error.main
            : hasText
              ? theme.palette.primary.contrastText
              : theme.palette.text.secondary,
          borderColor: isStreaming
            ? errorInteraction.hoverBorder
            : hasText
              ? 'transparent'
              : theme.palette.border.hover,
          boxShadow: 'none',
        },
      },
      '&:active': { transform: 'translateY(0) scale(0.97)' },
      '&.Mui-focusVisible': {
        outline: `2px solid ${theme.palette.border.focus}`,
        outlineOffset: 2,
      },
      '&.Mui-disabled': {
        backgroundColor: theme.palette.action.disabledBackground,
        borderColor: theme.palette.border.idle,
        color: theme.palette.action.disabled,
        boxShadow: 'none',
      },
    }),
    [errorInteraction, hasText, isStreaming, theme],
  );
  const composerSurfaceSx = useMemo(() => getComposerSurfaceSx(theme), [theme]);
  const composerLayoutSx = useMemo(() => getComposerLayoutSx(theme), [theme]);
  const inputPlaceholder = isStreaming
    ? 'Draft your next message'
    : 'How can I help you today?';

  const selectedProviderOption = useMemo(() => {
    return providerOptions.find((provider) => provider.name === selectedProvider) || null;
  }, [providerOptions, selectedProvider]);
  const activeProviderLabel = selectedProviderOption?.label || selectedProvider || '';
  const llmSections = useMemo(() => {
    return providerOptions
      .filter((provider) => Array.isArray(provider.models) && provider.models.length > 0)
      .map((provider) => ({
        name: provider.name,
        label: provider.label || provider.name,
        models: provider.models,
      }));
  }, [providerOptions]);
  const hasLlmOptions = llmSections.length > 0;
  const contextUsage = useMemo(() => getContextUsage(usageMetrics), [usageMetrics]);

  const handleCloseContextMenu = useCallback(() => setContextAnchor(null), []);
  const handleCloseLlmPopover = useCallback(() => setLlmAnchor(null), []);

  const handleSchemaChange = useCallback(
    async (schema) => {
      setContextAnchor(null);
      if (schema === currentSchema) return;

      const result = await onSchemaChange?.(schema);
      if (result && !result.success) {
        logger.error('Failed to select schema:', result.error);
      }
    },
    [currentSchema, onSchemaChange],
  );

  const handleDatabaseChange = useCallback(
    (dbName) => {
      setContextAnchor(null);
      if (dbName === currentDatabase) return;
      onDatabaseSwitch?.(dbName);
    },
    [currentDatabase, onDatabaseSwitch],
  );

  // ENH [SLASH-COMMAND]: Detect slash commands typed at the start of the
  // message. When the message starts with "/" and has no whitespace yet,
  // we show the SlashCommandMenu anchored to the composer. The menu
  // filters its options by the text after "/" (e.g., "/lon" → "Long Task").
  // Typing a space, deleting the "/", or selecting a command closes it.
  //
  // NOTE: These must be declared BEFORE handleSubmit and handleKeyDown,
  // because handleKeyDown references `isSlashMenuOpen` in its dependency
  // array, which is evaluated immediately during render. Declaring it
  // after would cause a temporal-dead-zone ReferenceError.
  const slashQuery = useMemo(() => extractSlashQuery(message), [message]);
  const isSlashMenuOpen = slashQuery !== null && !message.includes(' ');

  const handleSlashCommandSelect = useCallback(
    (command) => {
      // Apply the task-mode change (if the command has a value).
      if (command.value && onTaskModeChange) {
        onTaskModeChange(command.value);
      }
      // Strip the slash text from the message so the user can continue
      // typing their actual prompt. If the command was the picker
      // ("/mode" with value=null), we still clear the slash so the menu
      // closes and the user can type their prompt.
      setMessage((prev) => {
        // Remove the first token (the slash command) and any single
        // trailing space, preserving the rest of the message.
        const remainder = prev.split(/\s+(.*)/s, 2)[1] || '';
        return remainder;
      });
    },
    [onTaskModeChange],
  );

  const handleSlashCommandClose = useCallback(() => {
    // Closing the menu without selecting: clear the slash so it doesn't
    // reopen on the next keystroke. The user can retype "/" to reopen.
    setMessage((prev) => {
      if (!prev.startsWith('/')) return prev;
      const remainder = prev.split(/\s+(.*)/s, 2)[1] || '';
      return remainder;
    });
  }, []);

  const handleSubmit = useCallback(
    (e) => {
      e?.preventDefault();
      if (message.trim() && !disabled && !isStreaming) {
        onSend(message.trim());
        setMessage('');
      }
    },
    [message, disabled, isStreaming, onSend],
  );

  // ENH [SLASH-COMMAND]: When the slash command menu is open, Enter and
  // Tab are intercepted by the menu's document-level keydown listener
  // (capture phase) to select the highlighted command. We also guard
  // here so that even if the event reaches the input, we don't submit
  // a half-typed slash command. ArrowUp/ArrowDown/Escape are handled
  // the same way in the menu's listener.
  const handleKeyDown = useCallback(
    (e) => {
      if (isSlashMenuOpen) {
        // The slash menu's capture-phase listener will handle
        // Enter/Tab/Arrow/Escape. For any other key, fall through so
        // the user can keep typing to filter the menu.
        if (
          e.key === 'Enter' ||
          e.key === 'Tab' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'Escape'
        ) {
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, isSlashMenuOpen],
  );

  const handleInputChange = useCallback((e) => {
    setMessage(e.target.value);
  }, []);

  const handleOpenContextMenu = useCallback((e) => setContextAnchor(e.currentTarget), []);
  const handleOpenLlmPopover = useCallback((e) => setLlmAnchor(e.currentTarget), []);

  const handleStopClick = useCallback(() => {
    onStop?.();
  }, [onStop]);

  const handleLlmSelection = useCallback(
    (providerName, modelName) => {
      onSelectLlm?.(providerName, modelName);
      setLlmAnchor(null);
    },
    [onSelectLlm],
  );

  const handleMenuItemKeyDown = useCallback((event, onSelect) => {
    const items = Array.from(
      event.currentTarget
        .closest('[role="menu"]')
        ?.querySelectorAll('[role="menuitemradio"]:not([aria-disabled="true"])') || [],
    );
    const currentIndex = items.indexOf(event.currentTarget);
    const focusItem = (index) => {
      items[index]?.focus();
    };

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        onSelect();
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        focusItem((currentIndex + 1) % items.length);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        focusItem((currentIndex - 1 + items.length) % items.length);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      default:
        break;
    }
  }, []);

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        ...composerLayoutSx.form,
        position: 'relative',
        zIndex: 2,
      }}
    >
      <AppPopover
        anchorEl={contextAnchor}
        open={Boolean(contextAnchor)}
        onClose={handleCloseContextMenu}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        width={260}
        paperSx={{ mt: -1 }}
      >
        <AppPopoverList role="menu" aria-label="Chat context" maxHeight={360}>
          {showDatabaseSelector ? (
            <>
              <AppPopoverSectionLabel>Database</AppPopoverSectionLabel>
              {availableDatabases.map((db) => {
                const isActive = db === currentDatabase;
                return (
                  <AppPopoverItem
                    role="menuitemradio"
                    ariaChecked={isActive}
                    key={db}
                    onClick={() => handleDatabaseChange(db)}
                    onKeyDown={(event) =>
                      handleMenuItemKeyDown(event, () => handleDatabaseChange(db))
                    }
                    selected={isActive}
                    icon={<DatabaseIcon />}
                    label={db}
                    reserveTrailing
                    trailing={isActive ? <CheckIcon /> : null}
                  />
                );
              })}

              {showSchemaSelector && (
                <>
                  <Box aria-hidden sx={getPopoverDividerSx(theme, { my: 0.5 })} />
                  <AppPopoverSectionLabel sx={{ pt: 0.25 }}>
                    PostgreSQL schema
                  </AppPopoverSectionLabel>
                  {availableSchemas.map((schema) => {
                    const isActive = schema === currentSchema;
                    return (
                      <AppPopoverItem
                        role="menuitemradio"
                        ariaChecked={isActive}
                        key={schema}
                        onClick={() => handleSchemaChange(schema)}
                        onKeyDown={(event) =>
                          handleMenuItemKeyDown(event, () => handleSchemaChange(schema))
                        }
                        selected={isActive}
                        icon={<SchemaIcon />}
                        label={schema}
                        reserveTrailing
                        trailing={isActive ? <CheckIcon /> : null}
                      />
                    );
                  })}
                </>
              )}
            </>
          ) : (
            <AppPopoverEmptyState
              title="No database connected"
              description="Connect a database from the sidebar to add schema context."
            />
          )}
        </AppPopoverList>
      </AppPopover>
      <AppPopover
        anchorEl={llmAnchor}
        open={Boolean(llmAnchor)}
        onClose={handleCloseLlmPopover}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        width={288}
        paperSx={{ mt: -1 }}
      >
        {/* Model list */}
        <AppPopoverList role="menu" aria-label="Select model" maxHeight={280}>
          {llmOptionsLoading ? (
            // Match the real row geometry: model label first, compact status
            // slot second. This prevents layout movement when options arrive.
            <Box sx={{ display: 'grid', gap: 0.25 }}>
              {[0, 1, 2].map((i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 16px',
                    alignItems: 'center',
                    gap: 1,
                    minHeight: UI_POPOVER.rowMinHeight,
                    px: 1,
                    py: UI_POPOVER.rowPaddingY,
                  }}
                >
                  <Skeleton
                    variant="rounded"
                    animation="wave"
                    sx={{
                      width: `${78 - i * 12}%`,
                      height: 11,
                      borderRadius: 999,
                    }}
                  />
                  <Skeleton variant="circular" width={14} height={14} animation="wave" />
                </Box>
              ))}
            </Box>
          ) : hasLlmOptions ? (
            llmSections.map((section, sectionIndex) => (
              <Box key={section.name}>
                {sectionIndex > 0 && <Box aria-hidden sx={getPopoverDividerSx(theme)} />}
                <AppPopoverSectionLabel sx={{ pt: sectionIndex > 0 ? 0.25 : 0.5 }}>
                  {section.label}
                </AppPopoverSectionLabel>
                {section.models.map((model) => {
                  const isActive = section.name === selectedProvider && model === selectedModel;
                  return (
                    <AppPopoverItem
                      role="menuitemradio"
                      ariaChecked={isActive}
                      key={`${section.name}-${model}`}
                      onClick={() => handleLlmSelection(section.name, model)}
                      onKeyDown={(event) =>
                        handleMenuItemKeyDown(event, () => handleLlmSelection(section.name, model))
                      }
                      selected={isActive}
                      label={model}
                      reserveTrailing
                      trailing={isActive ? <CheckIcon /> : null}
                    />
                  );
                })}
              </Box>
            ))
          ) : (
            <AppPopoverEmptyState
              title="No models available"
              description="Model options could not be loaded."
            />
          )}
        </AppPopoverList>
      </AppPopover>

      <Box
        ref={setComposerElement}
        sx={{
          maxWidth: COMPOSER_MAX_WIDTH,
          ...composerLayoutSx.surface,
          mx: 'auto',
          position: 'relative',
          ...composerSurfaceSx,
          cursor: 'text',
        }}
      >
        <Box
          sx={{
            minHeight: 'inherit',
            ...composerLayoutSx.content,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <TextField
            fullWidth
            multiline
            minRows={1}
            maxRows={6}
            placeholder={inputPlaceholder}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            variant="standard"
            InputProps={{
              disableUnderline: true,
              sx: {
                lineHeight: 1.55,
                py: 0,
                px: 0,
                color: 'text.primary',
                alignItems: 'flex-start',
              },
            }}
            inputProps={{
              'data-ui-target': 'chat_input',
              'aria-label': 'Message Moonlit',
            }}
            sx={inputSx}
          />

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              ...composerLayoutSx.toolbar,
            }}
          >
            <Box sx={toolbarScrollSx}>
              <Tooltip title="Database and schema context">
                <Button
                  variant="text"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={handleOpenContextMenu}
                  aria-expanded={Boolean(contextAnchor)}
                  aria-label="Open chat context menu"
                  sx={{
                    ...toolbarActionButtonStyles,
                    maxWidth: 116,
                    px: { xs: 1, md: 1.5 },
                  }}
                >
                  Context
                </Button>
              </Tooltip>

              <Tooltip
                title={
                  sqlEditorOpen
                    ? 'Close SQL editor'
                    : isConnected
                      ? 'Open SQL editor'
                      : 'Connect a database to open SQL editor'
                }
              >
                <Button
                  type="button"
                  variant="text"
                  size="small"
                  startIcon={<CodeEditorIcon />}
                  onClick={onToggleSqlEditor ?? undefined}
                  aria-label={sqlEditorOpen ? 'Close SQL editor' : 'Open SQL editor'}
                  aria-pressed={sqlEditorOpen}
                  sx={{
                    ...toolbarActionButtonStyles,
                    width: 'auto',
                    px: { xs: 1, md: 1.5 },
                  }}
                >
                  SQL
                </Button>
              </Tooltip>

              {effectiveTaskMode && (
                <Typography
                  aria-label={`Effective task mode: ${effectiveTaskMode.label}`}
                  sx={{
                    display: { xs: 'none', md: 'block' },
                    px: 0.5,
                    color: 'text.disabled',
                    fontSize: '0.7rem',
                    fontWeight: 400,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {effectiveTaskMode.label}
                </Typography>
              )}
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                flexShrink: 0,
              }}
            >
              <Tooltip
                title={
                  contextUsage ? (
                    <ContextUsageTooltip
                      contextUsage={contextUsage}
                      selectedModel={selectedModel}
                    />
                  ) : activeProviderLabel ? (
                    `${selectedModel || 'Select model'} - ${activeProviderLabel}`
                  ) : (
                    'Select model'
                  )
                }
              >
                <span>
                  <Button
                    variant="text"
                    size="small"
                    onClick={handleOpenLlmPopover}
                    disabled={!hasLlmOptions && !llmOptionsLoading}
                    aria-expanded={Boolean(llmAnchor)}
                    aria-label="Select model"
                    startIcon={
                      contextUsage ? (
                        <ContextProgressRing value={contextUsage.activePercent} theme={theme} />
                      ) : undefined
                    }
                    endIcon={
                      <ExpandMoreIcon
                        sx={{
                          transform: llmAnchor ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: theme.transitions.create('transform', {
                            duration: 150,
                          }),
                        }}
                      />
                    }
                    sx={{
                      ...toolbarActionButtonStyles,
                      width: { xs: 116, md: 156 },
                      flexShrink: 0,
                    }}
                  >
                    <ModelSelectorLabel
                      key={selectedModel || (llmOptionsLoading ? 'loading' : 'choose-model')}
                      label={selectedModel || (llmOptionsLoading ? 'Loading' : 'Choose model')}
                    />
                  </Button>
                </span>
              </Tooltip>

              <Tooltip
                title={
                  isStreaming ? 'Stop generating' : hasText ? 'Send message' : 'Type a message'
                }
              >
                <span>
                  <IconButton
                    type={isStreaming ? 'button' : 'submit'}
                    onClick={isStreaming ? handleStopClick : undefined}
                    disabled={!isStreaming && (!hasText || disabled)}
                    aria-label={isStreaming ? 'Stop generating response' : 'Send message'}
                    sx={sendActionSx}
                  >
                    {isStreaming ? (
                      <StopIcon sx={{ fontSize: 14 }} />
                    ) : (
                      <SendIcon sx={{ fontSize: 14, ml: '1px' }} />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </Box>
      </Box>

      {/*
        ENH [SLASH-COMMAND]: Inline command menu. Opens when the user types
        "/" at the start of the message. Lets them pick the task mode
        (Auto / Standard / Tool Task / Long Task) without adding a button
        to the toolbar. Filtered by the text after "/" — e.g., "/lon"
        shows only "Long Task". Keyboard: ↑↓ navigate, ↵/Tab select,
        Esc close. On select, the slash text is stripped from the message
        and the mode is applied.
      */}
      {isSlashMenuOpen && composerElement && (
        <SlashCommandMenu
          key={slashQuery}
          anchorEl={composerElement}
          query={slashQuery}
          currentTaskMode={taskMode ?? 'auto'}
          onSelect={handleSlashCommandSelect}
          onClose={handleSlashCommandClose}
        />
      )}
      {children}
    </Box>
  );
}

function arePropsEqual(prevProps, nextProps) {
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  if (prevProps.disabled !== nextProps.disabled) return false;
  if (prevProps.isConnected !== nextProps.isConnected) return false;
  if (prevProps.dbType !== nextProps.dbType) return false;
  if (prevProps.currentDatabase !== nextProps.currentDatabase) return false;
  if (prevProps.selectedProvider !== nextProps.selectedProvider) return false;
  if (prevProps.selectedModel !== nextProps.selectedModel) return false;
  if (prevProps.llmOptionsLoading !== nextProps.llmOptionsLoading) return false;
  if (prevProps.providerOptions !== nextProps.providerOptions) return false;
  if (prevProps.onSend !== nextProps.onSend) return false;
  if (prevProps.onStop !== nextProps.onStop) return false;
  if (prevProps.onDatabaseSwitch !== nextProps.onDatabaseSwitch) return false;
  if (prevProps.onSelectLlm !== nextProps.onSelectLlm) return false;
  if (prevProps.onSchemaChange !== nextProps.onSchemaChange) return false;
  if (prevProps.currentSchema !== nextProps.currentSchema) return false;
  if (prevProps.usageMetrics !== nextProps.usageMetrics) return false;
  // ENH [AUTO-TASK-MODE]: Re-render when the task-mode setting or the
  // backend-reported effective mode changes.
  if (prevProps.taskMode !== nextProps.taskMode) return false;
  if (prevProps.onTaskModeChange !== nextProps.onTaskModeChange) return false;
  if (prevProps.effectiveTaskMode !== nextProps.effectiveTaskMode) return false;
  if (prevProps.onToggleSqlEditor !== nextProps.onToggleSqlEditor) return false;
  if (prevProps.sqlEditorOpen !== nextProps.sqlEditorOpen) return false;
  if (prevProps.children !== nextProps.children) return false;
  if (prevProps.availableDatabases?.length !== nextProps.availableDatabases?.length) return false;
  // Compare actual database identifiers, not just count, so a rename still
  // triggers a re-render even when the number of databases is unchanged.
  const prevDbKey = prevProps.availableDatabases
    ?.map((db) => db?.name || db?.database || db?.id || String(db))
    .join('\x1f');
  const nextDbKey = nextProps.availableDatabases
    ?.map((db) => db?.name || db?.database || db?.id || String(db))
    .join('\x1f');
  if (prevDbKey !== nextDbKey) return false;
  return true;
}

export default memo(ChatInput, arePropsEqual);
