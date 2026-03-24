import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  Box,
  TextField,
  IconButton,
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
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import RadioButtonCheckedRoundedIcon from '@mui/icons-material/RadioButtonCheckedRounded';
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
import { getCompactActionSx, getToolbarChipSx, UI_LAYOUT } from '../styles/shared';

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
    height: isCompactMobile ? 28 : 26,
    width: 'auto',
    maxWidth: { xs: 'min(44vw, 132px)', sm: 190 },
    borderRadius: '12px',
    borderColor: llmAnchor
      ? alpha(theme.palette.text.primary, 0.26)
      : alpha(theme.palette.text.primary, 0.12),
    backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.58 : 0.84),
    color: 'text.primary',
    boxShadow: llmAnchor
      ? '0 0 0 1px ' + alpha(theme.palette.text.primary, 0.06)
      : 'none',
    '& .MuiChip-icon': {
      color: reasoningEnabled ? theme.palette.info.main : theme.palette.text.secondary,
      ml: 0.75,
    },
    '& .MuiChip-label': {
      display: 'inline-flex',
      alignItems: 'center',
      overflow: 'hidden',
      maxWidth: '100%',
      paddingLeft: theme.spacing(0.75),
      paddingRight: theme.spacing(0.75),
      py: 0,
    },
  }), [theme, isCompactMobile, hasLlmOptions, llmOptionsLoading, llmAnchor, reasoningEnabled]);

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
        <Box component="form" onSubmit={handleSubmit} sx={{ p: { xs: 1, sm: 3 }, pb: { xs: 'max(env(safe-area-inset-bottom), 10px)', sm: 2.5 } }}>
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
            PaperProps={{
              sx: {
                width: { xs: 'min(280px, calc(100vw - 24px))', sm: 292 },
                mb: 0.75,
                borderRadius: '16px',
                border: '1px solid',
                borderColor: alpha(theme.palette.text.primary, 0.08),
                backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.96 : 0.99),
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                boxShadow: `0 14px 36px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.22 : 0.12)}`,
                overflow: 'hidden',
                [BACKDROP_FILTER_FALLBACK_QUERY]: {
                  backdropFilter: 'none',
                  WebkitBackdropFilter: 'none',
                },
              },
            }}
          >
            <Box sx={{ p: 0.75 }}>
              <Typography variant="overline" sx={{ px: 1, py: 0.25, display: 'block', color: 'text.secondary', fontSize: '0.68rem', letterSpacing: '0.14em' }}>
                Select model
              </Typography>
              <Box sx={{ px: 1, pb: 0.75 }}>
                <Typography sx={{ fontWeight: 500, fontSize: '0.95rem', color: 'text.primary' }}>{selectedModel || 'Choose a model'}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.74rem' }}>{activeProviderLabel || 'Available providers'}</Typography>
              </Box>
              <Divider sx={{ borderColor: alpha(theme.palette.text.primary, 0.08) }} />
              <Box sx={{ py: 0.5, maxHeight: 248, overflowY: 'auto' }}>
                {llmOptionsLoading ? (
                  <Box sx={{ px: 1, display: 'grid', gap: 0.75 }}>
                    {[0, 1, 2].map((index) => (
                      <Skeleton key={index} variant="rounded" height={42} sx={{ borderRadius: 1.5 }} />
                    ))}
                  </Box>
                ) : hasLlmOptions ? (
                  llmSections.map((section, sectionIndex) => (
                    <Box key={section.name} sx={{ px: 0.25, pt: sectionIndex === 0 ? 0 : 0.5 }}>
                      <Typography variant="overline" sx={{ px: 0.75, py: 0.25, display: 'block', color: 'text.secondary', fontSize: '0.66rem', letterSpacing: '0.14em' }}>
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
                              borderRadius: 1.5,
                              mx: 0.25,
                              px: 1,
                              py: 0.7,
                              minHeight: 40,
                              alignItems: 'flex-start',
                              gap: 0.65,
                              '&.Mui-selected': {
                                backgroundColor: alpha(theme.palette.info.main, 0.08),
                              },
                              '&.Mui-selected:hover': {
                                backgroundColor: alpha(theme.palette.info.main, 0.12),
                              },
                            }}
                          >
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontWeight: isActive ? 600 : 400, fontSize: '0.95rem' }}>{model}</Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.74rem' }}>
                                {model === section.defaultModel ? 'Default model' : section.label}
                              </Typography>
                            </Box>
                            {isActive ? <RadioButtonCheckedRoundedIcon sx={{ fontSize: 16, color: 'info.main', mt: 0.2 }} /> : <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 16, color: 'text.disabled', mt: 0.2 }} />}
                          </MenuItem>
                        );
                      })}
                    </Box>
                  ))
                ) : (
                  <Box sx={{ px: 1, py: 1.1 }}>
                    <Typography sx={{ fontWeight: 500, fontSize: '0.95rem' }}>No models available</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.74rem' }}>
                      Model options could not be loaded right now.
                    </Typography>
                  </Box>
                )}
              </Box>
              <Divider sx={{ borderColor: alpha(theme.palette.text.primary, 0.08) }} />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.25, px: 1, py: 0.85 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 500, fontSize: '0.95rem' }}>Extended thinking</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.74rem' }}>
                    Think longer for more complex tasks.
                  </Typography>
                </Box>
                <Switch
                  checked={reasoningEnabled}
                  onChange={toggleReasoning}
                  inputProps={{ 'aria-label': 'Toggle extended thinking' }}
                  sx={{
                    width: 34,
                    height: 22,
                    p: 0,
                    flexShrink: 0,
                    '& .MuiSwitch-switchBase': {
                      p: '3px',
                      transitionDuration: '180ms',
                      '&.Mui-checked': {
                        transform: 'translateX(12px)',
                        color: theme.palette.common.white,
                        '& + .MuiSwitch-track': {
                          opacity: 1,
                          backgroundColor: alpha(theme.palette.info.main, 0.72),
                        },
                      },
                    },
                    '& .MuiSwitch-thumb': {
                      boxShadow: 'none',
                      width: 16,
                      height: 16,
                    },
                    '& .MuiSwitch-track': {
                      borderRadius: 11,
                      opacity: 1,
                      backgroundColor: alpha(theme.palette.text.primary, 0.14),
                    },
                  }}
                />
              </Box>
            </Box>
          </Popover>
          <Box
            sx={{
              maxWidth: UI_LAYOUT.chatInputMaxWidth,
              mx: 'auto',
              px: { xs: 1.1, sm: 1.5 },
              py: { xs: 1, sm: 1.2 },
              borderRadius: { xs: '22px', sm: '28px' },
              border: '1px solid',
              borderColor: isFocused ? alpha(theme.palette.text.primary, 0.18) : alpha(theme.palette.text.primary, 0.1),
              background: `linear-gradient(180deg, ${alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.66 : 0.92)} 0%, ${alpha(theme.palette.background.default, theme.palette.mode === 'dark' ? 0.5 : 0.84)} 100%)`,
              boxShadow: isFocused
                ? `0 14px 42px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.24 : 0.08)}`
                : `0 10px 28px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.18 : 0.06)}`,
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              [BACKDROP_FILTER_FALLBACK_QUERY]: {
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
              },
              [theme.breakpoints.down('sm')]: {
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
              },
              transition: theme.transitions.create(['border-color', 'box-shadow', 'background'], { duration: theme.transitions.duration.shorter }),
              [HOVER_CAPABLE_QUERY]: {
                '&:hover': {
                  borderColor: alpha(theme.palette.text.primary, 0.16),
                },
              },
            }}
          >
            <TextField
              fullWidth
              multiline
              minRows={isCompactMobile ? 2 : 3}
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
            <Box
              sx={{
                mt: 0.9,
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: { xs: 0.6, sm: 1 },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  flexWrap: 'nowrap',
                  minWidth: 0,
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  pr: 0.25,
                  scrollbarWidth: 'none',
                  '&::-webkit-scrollbar': { display: 'none' },
                }}
              >
                <Tooltip title="Attach file (coming soon)">
                  <span>
                    <IconButton
                      size="small"
                      disabled
                      aria-label="Attach file (coming soon)"
                      sx={{
                        ...getCompactActionSx(theme),
                        display: { xs: 'none', sm: 'inline-flex' },
                        color: 'text.secondary',
                        opacity: 0.42,
                        width: { xs: 34, sm: 36 },
                        height: { xs: 34, sm: 36 },
                        minWidth: { xs: 34, sm: 36 },
                        minHeight: { xs: 34, sm: 36 },
                      }}
                    >
                      <AddRoundedIcon sx={{ fontSize: 19 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                {showDatabaseSelector && (
                  <Tooltip title={canSwitchDatabase ? `Database: ${currentDatabase} (click to switch)` : `Database: ${currentDatabase}`}>
                    <Chip
                      icon={<StorageOutlinedIcon sx={{ fontSize: 14 }} />}
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
                      icon={<AccountTreeOutlinedIcon sx={{ fontSize: 14 }} />}
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
                      icon={<CodeRoundedIcon sx={{ fontSize: 14 }} />}
                      label="SQL Editor"
                      onClick={handleOpenSqlEditorClick}
                      size="small"
                      sx={toolbarChipStyles}
                    />
                  </Tooltip>
                )}
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 0.55,
                  flexShrink: 0,
                  ml: 'auto',
                  minWidth: 'fit-content',
                }}
              >
                <Tooltip title={activeProviderLabel ? `${selectedModel || 'Select model'} · ${activeProviderLabel}` : 'Select model'}>
                  <span>
                    <Chip
                      clickable
                      disabled={!hasLlmOptions && !llmOptionsLoading}
                      onClick={handleOpenLlmPopover}
                      label={(
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, minWidth: 0, maxWidth: '100%' }}>
                          <Typography
                            component="span"
                            sx={{ fontWeight: 400, minWidth: 0, maxWidth: { xs: 98, sm: 145 }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: { xs: '0.79rem', sm: '0.84rem' } }}
                          >
                            {modelChipLabel}
                          </Typography>
                          <KeyboardArrowDownRoundedIcon
                            sx={{
                              fontSize: 18,
                              color: 'text.secondary',
                              transform: llmAnchor ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: theme.transitions.create('transform', { duration: 150 }),
                            }}
                          />
                        </Box>
                      )}
                      sx={llmChipStyles}
                    />
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
                        width: { xs: 38, sm: 40 },
                        height: { xs: 38, sm: 40 },
                        minWidth: { xs: 38, sm: 40 },
                        minHeight: { xs: 38, sm: 40 },
                        flexShrink: 0,
                        borderRadius: { xs: '12px', sm: '14px' },
                        color: isStreaming ? theme.palette.error.main : (hasText ? theme.palette.primary.contrastText : 'text.disabled'),
                        backgroundColor: isStreaming
                          ? alpha(theme.palette.error.main, 0.12)
                          : (hasText ? theme.palette.primary.main : alpha(theme.palette.text.primary, 0.04)),
                        border: '1px solid',
                        borderColor: isStreaming
                          ? alpha(theme.palette.error.main, 0.26)
                          : (hasText ? alpha(theme.palette.primary.main, 0.8) : alpha(theme.palette.text.primary, 0.08)),
                        '&:hover': {
                          backgroundColor: isStreaming
                            ? alpha(theme.palette.error.main, 0.18)
                            : (hasText ? theme.palette.primary.dark : alpha(theme.palette.text.primary, 0.08)),
                        },
                      }}
                    >
                      {isStreaming ? (
                        <StopRoundedIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
                      ) : (
                        <SendRoundedIcon sx={{ fontSize: { xs: 18, sm: 20 }, ml: 0.15 }} />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>
          </Box>
          {showSuggestions && (
            <Box sx={{ maxWidth: UI_LAYOUT.chatInputMaxWidth, mx: 'auto', mt: 1.5, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {suggestions.map((chip, index) => (
                <Chip
                  key={chip.label}
                  icon={chip.icon}
                  label={chip.label}
                  onClick={() => handleSuggestionClick(chip.prompt)}
                  size="small"
                  sx={{
                    borderRadius: '12px',
                    border: '1px solid',
                    borderColor: alpha(theme.palette.text.primary, 0.16),
                    color: 'text.secondary',
                    height: 30,
                    backgroundColor: alpha(theme.palette.background.paper, 0.32),
                    cursor: 'pointer',
                    opacity: 0,
                    animation: 'chipFadeIn 0.4s ease forwards',
                    animationDelay: `${index * 0.08}s`,
                    [REDUCED_MOTION_QUERY]: {
                      opacity: 1,
                      animation: 'none',
                    },
                    '@keyframes chipFadeIn': {
                      from: { opacity: 0, transform: 'translateY(8px)' },
                      to: { opacity: 1, transform: 'translateY(0)' },
                    },
                    transition: 'transform 0.15s ease, border-color 0.15s ease, background-color 0.15s ease',
                    '& .MuiChip-icon': {
                      color: 'inherit',
                      ml: 0.5,
                    },
                    [HOVER_CAPABLE_QUERY]: {
                      '&:hover': {
                        borderColor: alpha(theme.palette.text.primary, 0.28),
                        backgroundColor: alpha(theme.palette.background.paper, 0.52),
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
              mt: { xs: 1, sm: 1.5 },
              px: 1,
              ...theme.typography.uiCaptionXs,
              color: 'text.secondary',
              opacity: 0.5,
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













