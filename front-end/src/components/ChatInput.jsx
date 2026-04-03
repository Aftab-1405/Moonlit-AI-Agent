import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  Box,
  TextField,
  IconButton,
  ButtonBase,
  Tooltip,
  Typography,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Collapse,
  Fab,
  Popover,
  Divider,
  Switch,
  Skeleton,
  useMediaQuery,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import { getSchemas, selectSchema } from '../api';
import {
  BACKDROP_FILTER_FALLBACK_QUERY,
  HOVER_CAPABLE_QUERY,
  REDUCED_MOTION_QUERY,
} from '../styles/mediaQueries';
import logger from '../utils/logger';
import { getToolbarChipSx, UI_LAYOUT } from '../styles/shared';

const MENU_HEADER_STYLES = { px: 2, py: 0.5, display: 'block', color: 'text.secondary' };
const LIST_ITEM_ICON_STYLES = { minWidth: 28 };

function ChatInput({
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
  isConnected = false,
  dbType = null,
  currentDatabase = null,
  availableDatabases = [],
  onDatabaseSwitch,
  showSuggestions = true,
  onOpenSqlEditor,
  selectedProvider = '',
  selectedModel = '',
  providerOptions = [],
  llmOptionsLoading = false,
  onSelectLlm,
}) {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const theme = useTheme();
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { settings, updateSetting } = useAppTheme();
  const reasoningEnabled = settings.enableReasoning ?? true;
  const [schemas, setSchemas] = useState([]);
  const [currentSchema, setCurrentSchema] = useState('public');
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaAnchor, setSchemaAnchor] = useState(null);
  const [dbAnchor, setDbAnchor] = useState(null);
  const [llmAnchor, setLlmAnchor] = useState(null);

  const isPostgreSQL = useMemo(() =>
    dbType?.toLowerCase() === 'postgresql',
  [dbType]);

  const isSQLite = useMemo(() =>
    dbType?.toLowerCase() === 'sqlite',
  [dbType]);

  const showSchemaSelector = useMemo(() =>
    isConnected && isPostgreSQL && schemas.length > 0,
  [isConnected, isPostgreSQL, schemas.length]);
  const showDatabaseSelector = useMemo(() =>
    isConnected && currentDatabase,
  [isConnected, currentDatabase]);
  const canSwitchDatabase = useMemo(() =>
    availableDatabases.length > 1 && !isSQLite,
  [availableDatabases.length, isSQLite]);

  const hasText = useMemo(() =>
    message.trim().length > 0,
  [message]);

  const toolbarChipStyles = useMemo(() => (
    getToolbarChipSx(theme, { isCompactMobile })
  ), [theme, isCompactMobile]);
  const inputPlaceholder = isConnected
    ? 'Ask about your database or anything else...'
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
        defaultModel: provider.default_model || null,
        models: provider.models,
      }));
  }, [providerOptions]);
  const hasLlmOptions = llmSections.length > 0;
  const modelChipLabel = llmOptionsLoading
    ? 'Loading models...'
    : (selectedModel || 'Choose model');

  const handleCloseDbMenu = useCallback(() => setDbAnchor(null), []);
  const handleCloseSchemaMenu = useCallback(() => setSchemaAnchor(null), []);
  const handleCloseLlmPopover = useCallback(() => setLlmAnchor(null), []);

  const toggleHidden = useCallback(() => {
    setIsHidden((prev) => !prev);
  }, []);

  const toggleReasoning = useCallback(() => {
    updateSetting('enableReasoning', !reasoningEnabled);
  }, [updateSetting, reasoningEnabled]);

  const fetchSchemas = useCallback(async () => {
    setSchemaLoading(true);
    try {
      const data = await getSchemas();
      if (data.status === 'success') {
        setSchemas(data.schemas || []);
        setCurrentSchema(data.current_schema || 'public');
      }
    } catch (err) {
      logger.error('Failed to fetch schemas:', err);
    } finally {
      setSchemaLoading(false);
    }
  }, []);

  const handleSchemaChange = useCallback(async (schema) => {
    setSchemaAnchor(null);
    if (schema === currentSchema) return;

    setSchemaLoading(true);
    try {
      const data = await selectSchema(schema);
      if (data.status === 'success') {
        setCurrentSchema(schema);
      }
    } catch (err) {
      logger.error('Failed to select schema:', err);
    } finally {
      setSchemaLoading(false);
    }
  }, [currentSchema]);

  const handleDatabaseChange = useCallback((dbName) => {
    setDbAnchor(null);
    if (dbName === currentDatabase) return;
    onDatabaseSwitch?.(dbName);
  }, [currentDatabase, onDatabaseSwitch]);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  }, [message, disabled, onSend]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleInputChange = useCallback((e) => {
    setMessage(e.target.value);
  }, []);

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);

  const handleOpenDbMenu = useCallback((e) => setDbAnchor(e.currentTarget), []);
  const handleOpenSchemaMenu = useCallback((e) => setSchemaAnchor(e.currentTarget), []);
  const handleOpenLlmPopover = useCallback((e) => setLlmAnchor(e.currentTarget), []);

  const handleOpenSqlEditorClick = useCallback(() => {
    onOpenSqlEditor?.();
  }, [onOpenSqlEditor]);

  const handleStopClick = useCallback(() => {
    onStop?.();
  }, [onStop]);

  const handleLlmSelection = useCallback((providerName, modelName) => {
    onSelectLlm?.(providerName, modelName);
    setLlmAnchor(null);
  }, [onSelectLlm]);

  const suggestions = useMemo(() => [
    {
      label: 'Check Connection',
      icon: <StorageOutlinedIcon sx={{ fontSize: 14 }} />,
      prompt: 'Check my database connection status and show connection details',
    },
    {
      label: 'Schema Details',
      icon: <AccountTreeOutlinedIcon sx={{ fontSize: 14 }} />,
      prompt: 'Show me the database schema with all tables and their columns',
    },
    {
      label: 'Open SQL Editor',
      icon: <CodeRoundedIcon sx={{ fontSize: 14 }} />,
      prompt: 'Open the SQL editor and help me write a query',
    },
  ], []);

  const handleSuggestionClick = useCallback((prompt) => {
    onSend?.(prompt);
  }, [onSend]);

  useEffect(() => {
    if (isConnected && currentDatabase && isPostgreSQL) {
      fetchSchemas();
    } else {
      setSchemas([]);
      setCurrentSchema('public');
    }
  }, [isConnected, currentDatabase, isPostgreSQL, fetchSchemas]);

  const getMenuItemIcon = useCallback((isSelected, defaultIcon) =>
    isSelected
      ? <CheckRoundedIcon sx={{ fontSize: 16, color: 'success.main' }} />
      : defaultIcon,
    [],
  );

  const llmChipStyles = useMemo(() => ({
    ...getToolbarChipSx(theme, { isCompactMobile, interactive: hasLlmOptions || llmOptionsLoading }),
    maxWidth: { xs: 'min(44vw, 140px)', sm: 200 },
    borderColor: llmAnchor
      ? alpha(theme.palette.text.primary, 0.24)
      : alpha(theme.palette.text.primary, 0.14),
    backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.5 : 0.8),
    color: 'text.primary',
    '& .MuiChip-label': {
      display: 'inline-flex',
      alignItems: 'center',
      overflow: 'hidden',
      maxWidth: '100%',
      px: 0.875,
      py: 0,
      ...theme.typography.uiCaptionSm,
      lineHeight: 1,
    },
  }), [theme, isCompactMobile, hasLlmOptions, llmOptionsLoading, llmAnchor]);

  return (
    <Box sx={{ position: 'relative' }}>
      <Collapse in={isHidden} timeout={200}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
          <Tooltip title="Show input" arrow>
            <Fab
              size="small"
              onClick={toggleHidden}
              aria-label="Show message input"
              sx={{
                backgroundColor: theme.palette.action.hover,
                border: '1px solid',
                borderColor: theme.palette.divider,
                boxShadow: 'none',
                '&:hover': {
                  backgroundColor: theme.palette.action.selected,
                  boxShadow: 'none',
                },
              }}
            >
              <KeyboardArrowUpRoundedIcon sx={{ color: 'text.secondary' }} />
            </Fab>
          </Tooltip>
        </Box>
      </Collapse>
      <Collapse in={!isHidden} timeout={300}>
        <Box component="form" onSubmit={handleSubmit} sx={{ p: { xs: 0.75, sm: 1.5 }, pb: { xs: 'max(env(safe-area-inset-bottom), 8px)', sm: 1.75 } }}>
          <Menu
            anchorEl={dbAnchor}
            open={Boolean(dbAnchor)}
            onClose={handleCloseDbMenu}
            PaperProps={{ sx: { minWidth: 180, maxHeight: 320, '& .MuiMenuItem-root': { minHeight: { xs: 40, sm: 36 } } } }}
          >
            <Typography variant="overline" sx={MENU_HEADER_STYLES}>Switch Database</Typography>
            {availableDatabases.map((db) => (
              <MenuItem key={db} onClick={() => handleDatabaseChange(db)} selected={db === currentDatabase}>
                <ListItemIcon sx={LIST_ITEM_ICON_STYLES}>
                  {getMenuItemIcon(db === currentDatabase, <StorageOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />)}
                </ListItemIcon>
                <ListItemText primary={db} />
              </MenuItem>
            ))}
          </Menu>
          <Menu
            anchorEl={schemaAnchor}
            open={Boolean(schemaAnchor)}
            onClose={handleCloseSchemaMenu}
            PaperProps={{ sx: { minWidth: 160, maxHeight: 280, '& .MuiMenuItem-root': { minHeight: { xs: 40, sm: 36 } } } }}
          >
            <Typography variant="overline" sx={MENU_HEADER_STYLES}>PostgreSQL Schema</Typography>
            {schemas.map((schema) => (
              <MenuItem key={schema} onClick={() => handleSchemaChange(schema)} selected={schema === currentSchema}>
                <ListItemIcon sx={LIST_ITEM_ICON_STYLES}>
                  {getMenuItemIcon(schema === currentSchema, <AccountTreeOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />)}
                </ListItemIcon>
                <ListItemText primary={schema} />
              </MenuItem>
            ))}
          </Menu>
          <Popover
            anchorEl={llmAnchor}
            open={Boolean(llmAnchor)}
            onClose={handleCloseLlmPopover}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: {
                  width: { xs: 'min(268px, calc(100vw - 24px))', sm: 276 },
                  mt: -1,
                  borderRadius: '14px',
                  border: '1px solid',
                  borderColor: alpha(theme.palette.text.primary, 0.09),
                  backgroundColor: theme.palette.mode === 'dark'
                    ? alpha(theme.palette.background.elevated, 0.97)
                    : alpha(theme.palette.background.paper, 0.99),
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  boxShadow: `0 8px 28px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.3 : 0.1)}`,
                  overflow: 'hidden',
                  [BACKDROP_FILTER_FALLBACK_QUERY]: { backdropFilter: 'none', WebkitBackdropFilter: 'none' },
                },
              },
            }}
          >
            {/* Header */}
            <Box sx={{ px: 1.5, pt: 1.25, pb: 1 }}>
              <Typography sx={{
                ...theme.typography.uiCaption2xs,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'text.secondary',
                fontWeight: 600,
              }}>
                Model
              </Typography>
            </Box>

            <Divider sx={{ borderColor: alpha(theme.palette.text.primary, 0.07) }} />

            {/* Model list */}
            <Box sx={{ py: 0.5, maxHeight: 232, overflowY: 'auto' }}>
              {llmOptionsLoading ? (
                <Box sx={{ px: 1.25, py: 0.5, display: 'grid', gap: 0.5 }}>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} variant="rounded" height={36} sx={{ borderRadius: '8px' }} />
                  ))}
                </Box>
              ) : hasLlmOptions ? (
                llmSections.map((section, sectionIndex) => (
                  <Box key={section.name} sx={{ px: 0.75, pt: sectionIndex === 0 ? 0.25 : 0.75 }}>
                    <Typography sx={{
                      ...theme.typography.uiCaption2xs,
                      textTransform: 'uppercase',
                      letterSpacing: '0.07em',
                      color: 'text.disabled',
                      fontWeight: 600,
                      px: 0.75,
                      pb: 0.25,
                      display: 'block',
                    }}>
                      {section.label}
                    </Typography>
                    {section.models.map((model) => {
                      const isActive = section.name === selectedProvider && model === selectedModel;
                      return (
                        <MenuItem
                          role="menuitemradio"
                          aria-checked={isActive}
                          key={`${section.name}-${model}`}
                          selected={isActive}
                          onClick={() => handleLlmSelection(section.name, model)}
                          sx={{
                            borderRadius: '8px',
                            px: 1,
                            py: 0.625,
                            minHeight: 'unset',
                            gap: 1,
                            '&.Mui-selected': { backgroundColor: alpha(theme.palette.text.primary, 0.07) },
                            '&.Mui-selected:hover': { backgroundColor: alpha(theme.palette.text.primary, 0.1) },
                          }}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{
                              ...theme.typography.uiCaptionSm,
                              fontWeight: isActive ? 600 : 400,
                              color: 'text.primary',
                              lineHeight: 1.3,
                            }}>
                              {model}
                            </Typography>
                            {model === section.defaultModel && (
                              <Typography sx={{
                                ...theme.typography.uiCaption2xs,
                                color: 'text.disabled',
                                lineHeight: 1.2,
                                mt: 0.125,
                              }}>
                                Default
                              </Typography>
                            )}
                          </Box>
                          {isActive && (
                            <CheckRoundedIcon sx={{ fontSize: 13, color: 'text.primary', flexShrink: 0 }} />
                          )}
                        </MenuItem>
                      );
                    })}
                  </Box>
                ))
              ) : (
                <Box sx={{ px: 1.75, py: 1.25 }}>
                  <Typography sx={{ ...theme.typography.uiCaptionSm, fontWeight: 500, color: 'text.primary' }}>
                    No models available
                  </Typography>
                  <Typography sx={{ ...theme.typography.uiCaption2xs, color: 'text.secondary', mt: 0.25 }}>
                    Model options could not be loaded.
                  </Typography>
                </Box>
              )}
            </Box>

            <Divider sx={{ borderColor: alpha(theme.palette.text.primary, 0.07) }} />

            {/* Extended thinking toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ ...theme.typography.uiCaptionSm, fontWeight: 500, color: 'text.primary' }}>
                  Extended thinking
                </Typography>
                <Typography sx={{ ...theme.typography.uiCaption2xs, color: 'text.secondary', mt: 0.25 }}>
                  Think longer for complex tasks
                </Typography>
              </Box>
              <Switch
                checked={reasoningEnabled}
                onChange={toggleReasoning}
                inputProps={{ 'aria-label': 'Toggle extended thinking' }}
                sx={{
                  width: 32,
                  height: 20,
                  p: 0,
                  flexShrink: 0,
                  '& .MuiSwitch-switchBase': {
                    p: '3px',
                    transitionDuration: '180ms',
                    '&.Mui-checked': {
                      transform: 'translateX(12px)',
                      color: '#fff',
                      '& + .MuiSwitch-track': { opacity: 1, backgroundColor: theme.palette.primary.main },
                    },
                  },
                  '& .MuiSwitch-thumb': { boxShadow: 'none', width: 14, height: 14 },
                  '& .MuiSwitch-track': {
                    borderRadius: 10,
                    opacity: 1,
                    backgroundColor: alpha(theme.palette.text.primary, 0.16),
                  },
                }}
              />
            </Box>
          </Popover>
          <Box
            sx={{
              maxWidth: UI_LAYOUT.chatInputMaxWidth,
              mx: 'auto',
              p: { xs: 1.5, sm: 1.75 },
              borderRadius: '20px',
              background: theme.palette.mode === 'dark'
                ? theme.palette.background.paper
                : theme.palette.background.elevated,
              boxShadow: isFocused
                ? `0 0.25rem 1.25rem ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.08 : 0.075)}, 0 0 0 1px ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.22 : 0.18)}`
                : `0 0.25rem 1.25rem ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.04 : 0.035)}, 0 0 0 0.5px ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.1)}`,
              transition: theme.transitions.create('box-shadow', { duration: theme.transitions.duration.shorter }),
              [HOVER_CAPABLE_QUERY]: {
                '&:hover': {
                  boxShadow: isFocused
                    ? `0 0.25rem 1.25rem ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.08 : 0.075)}, 0 0 0 1px ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.26 : 0.22)}`
                    : `0 0.25rem 1.25rem ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.04 : 0.035)}, 0 0 0 0.5px ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.22 : 0.18)}`,
                },
              },
            }}
          >
            <TextField
              fullWidth
              multiline
              minRows={isCompactMobile ? 1 : 2}
              maxRows={6}
              placeholder={inputPlaceholder}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              disabled={disabled}
              variant="standard"
              InputProps={{
                disableUnderline: true,
                sx: { lineHeight: 1.5, py: 0, px: { xs: 0.35, sm: 0.5 }, color: 'text.primary', alignItems: 'flex-start' },
              }}
              sx={{
                '& .MuiInputBase-root': { p: 0 },
                '& .MuiInputBase-input': {
                  py: 0.15,
                  px: { xs: 0.1, sm: 0 },
                  ...theme.typography.uiInput,
                  '&::placeholder': {
                    color: 'text.secondary',
                    opacity: 0.72,
                  },
                },
              }}
            />
            {/* Action bar — flex, consistent 32px height for interactive elements */}
            <Box sx={{ mt: 0.875, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>

              {/* Left: attach + contextual context chips */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flex: 1, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
                <Tooltip title="Attach file (coming soon)">
                  <span>
                    <IconButton
                      size="small"
                      disabled
                      aria-label="Attach file (coming soon)"
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: '8px',
                        color: 'text.secondary',
                        opacity: 0.45,
                        flexShrink: 0,
                      }}
                    >
                      <AddRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                {showDatabaseSelector && (
                  <Tooltip title={canSwitchDatabase ? `Database: ${currentDatabase} (click to switch)` : `Database: ${currentDatabase}`}>
                    <Chip
                      icon={<StorageOutlinedIcon />}
                      label={currentDatabase}
                      onClick={canSwitchDatabase ? handleOpenDbMenu : undefined}
                      size="small"
                      sx={{ ...toolbarChipStyles, cursor: canSwitchDatabase ? 'pointer' : 'default' }}
                    />
                  </Tooltip>
                )}
                {showSchemaSelector && (
                  <Tooltip title={`Schema: ${schemaLoading ? '...' : currentSchema}`}>
                    <Chip
                      icon={<AccountTreeOutlinedIcon />}
                      label={currentSchema}
                      onClick={handleOpenSchemaMenu}
                      size="small"
                      sx={toolbarChipStyles}
                    />
                  </Tooltip>
                )}
                {onOpenSqlEditor && (
                  <Tooltip title="Open SQL Editor">
                    <Chip
                      icon={<CodeRoundedIcon />}
                      label="SQL Editor"
                      onClick={handleOpenSqlEditorClick}
                      size="small"
                      sx={toolbarChipStyles}
                    />
                  </Tooltip>
                )}
              </Box>

              {/* Right: model selector (ghost text button) + send */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                <Tooltip title={activeProviderLabel ? `${selectedModel || 'Select model'} · ${activeProviderLabel}` : 'Select model'}>
                  <span>
                    <ButtonBase
                      onClick={handleOpenLlmPopover}
                      disabled={!hasLlmOptions && !llmOptionsLoading}
                      aria-expanded={Boolean(llmAnchor)}
                      aria-label="Select model"
                      sx={{
                        height: 32,
                        borderRadius: '8px',
                        px: 1,
                        gap: 0.375,
                        display: 'inline-flex',
                        alignItems: 'center',
                        maxWidth: { xs: 'min(44vw, 140px)', sm: 200 },
                        color: 'text.secondary',
                        ...theme.typography.uiCaptionSm,
                        transition: theme.transitions.create('background-color', { duration: theme.transitions.duration.shorter }),
                        [HOVER_CAPABLE_QUERY]: {
                          '&:hover': { backgroundColor: alpha(theme.palette.text.primary, 0.06) },
                        },
                        '&[aria-expanded="true"]': { backgroundColor: alpha(theme.palette.text.primary, 0.08) },
                        '&.Mui-disabled': { opacity: 0.38, cursor: 'default' },
                      }}
                    >
                      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                        {modelChipLabel}
                      </Box>
                      <KeyboardArrowDownRoundedIcon sx={{
                        fontSize: 14,
                        flexShrink: 0,
                        opacity: 0.75,
                        transform: llmAnchor ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: theme.transitions.create('transform', { duration: 150 }),
                      }} />
                    </ButtonBase>
                  </span>
                </Tooltip>

                <Tooltip title={isStreaming ? 'Stop generating' : (hasText ? 'Send message' : 'Type a message')}>
                  <span>
                    <IconButton
                      type={isStreaming ? 'button' : 'submit'}
                      onClick={isStreaming ? handleStopClick : undefined}
                      disabled={!isStreaming && (!hasText || disabled)}
                      aria-label={isStreaming ? 'Stop generating response' : 'Send message'}
                      sx={{
                        width: 32,
                        height: 32,
                        flexShrink: 0,
                        borderRadius: '8px',
                        color: isStreaming
                          ? theme.palette.error.main
                          : (hasText ? theme.palette.primary.contrastText : alpha(theme.palette.text.primary, 0.28)),
                        backgroundColor: isStreaming
                          ? alpha(theme.palette.error.main, 0.1)
                          : (hasText ? theme.palette.primary.main : alpha(theme.palette.text.primary, 0.05)),
                        border: '1px solid',
                        borderColor: isStreaming
                          ? alpha(theme.palette.error.main, 0.2)
                          : (hasText ? alpha(theme.palette.primary.main, 0.6) : alpha(theme.palette.text.primary, 0.07)),
                        transition: theme.transitions.create(['background-color', 'border-color', 'color'], { duration: theme.transitions.duration.shorter }),
                        '&:hover': {
                          backgroundColor: isStreaming
                            ? alpha(theme.palette.error.main, 0.16)
                            : (hasText ? theme.palette.primary.dark : alpha(theme.palette.text.primary, 0.08)),
                        },
                        '&:active': { transform: 'scale(0.92)' },
                        '&.Mui-disabled': {
                          backgroundColor: alpha(theme.palette.text.primary, 0.04),
                          borderColor: alpha(theme.palette.text.primary, 0.06),
                          color: alpha(theme.palette.text.primary, 0.2),
                        },
                      }}
                    >
                      {isStreaming
                        ? <StopRoundedIcon sx={{ fontSize: 14 }} />
                        : <SendRoundedIcon sx={{ fontSize: 14, ml: '1px' }} />}
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>
          </Box>
          {showSuggestions && (
            <Box sx={{ maxWidth: UI_LAYOUT.chatInputMaxWidth, mx: 'auto', mt: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.625, flexWrap: 'wrap' }}>
              {suggestions.map((chip, index) => (
                <Chip
                  key={chip.label}
                  icon={chip.icon}
                  label={chip.label}
                  onClick={() => handleSuggestionClick(chip.prompt)}
                  size="small"
                  sx={{
                    height: 32,
                    borderRadius: '8px',
                    border: '0.5px solid',
                    borderColor: alpha(theme.palette.text.primary, 0.13),
                    color: 'text.secondary',
                    backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.28 : 0.6),
                    cursor: 'pointer',
                    opacity: 0,
                    animation: 'chipFadeIn 0.3s ease forwards',
                    animationDelay: `${index * 0.06}s`,
                    [REDUCED_MOTION_QUERY]: { opacity: 1, animation: 'none' },
                    '@keyframes chipFadeIn': {
                      from: { opacity: 0, transform: 'translateY(5px)' },
                      to: { opacity: 1, transform: 'translateY(0)' },
                    },
                    transition: 'border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease',
                    '& .MuiChip-label': {
                      px: 1.125,
                      ...theme.typography.uiCaptionSm,
                      lineHeight: 1,
                    },
                    '& .MuiChip-icon': { color: 'inherit', ml: 0.875, mr: -0.25, fontSize: 13 },
                    [HOVER_CAPABLE_QUERY]: {
                      '&:hover': {
                        borderColor: alpha(theme.palette.text.primary, 0.24),
                        backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.5 : 0.85),
                        color: 'text.primary',
                      },
                    },
                  }}
                />
              ))}
            </Box>
          )}
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textAlign: 'center',
              mt: { xs: 0.75, sm: 1 },
              px: 1,
              ...theme.typography.uiCaption2xs,
              color: 'text.secondary',
              opacity: 0.4,
              letterSpacing: '0.015em',
            }}
          >
            Moonlit can make mistakes. Verify important info.
          </Typography>
        </Box>
      </Collapse>
    </Box>
  );
}
function arePropsEqual(prevProps, nextProps) {
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  if (prevProps.disabled !== nextProps.disabled) return false;
  if (prevProps.isConnected !== nextProps.isConnected) return false;
  if (prevProps.dbType !== nextProps.dbType) return false;
  if (prevProps.currentDatabase !== nextProps.currentDatabase) return false;
  if (prevProps.showSuggestions !== nextProps.showSuggestions) return false;
  if (prevProps.selectedProvider !== nextProps.selectedProvider) return false;
  if (prevProps.selectedModel !== nextProps.selectedModel) return false;
  if (prevProps.llmOptionsLoading !== nextProps.llmOptionsLoading) return false;
  if (prevProps.providerOptions !== nextProps.providerOptions) return false;
  if (prevProps.onSend !== nextProps.onSend) return false;
  if (prevProps.onStop !== nextProps.onStop) return false;
  if (prevProps.onOpenSqlEditor !== nextProps.onOpenSqlEditor) return false;
  if (prevProps.onDatabaseSwitch !== nextProps.onDatabaseSwitch) return false;
  if (prevProps.onSelectLlm !== nextProps.onSelectLlm) return false;
  if (prevProps.availableDatabases?.length !== nextProps.availableDatabases?.length) return false;
  return true;
}

export default memo(ChatInput, arePropsEqual);