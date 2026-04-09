import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  Box,
  TextField,
  IconButton,
  ButtonBase,
  Tooltip,
  Typography,
  Chip,
  Switch,
  Skeleton,
  useMediaQuery,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import StreamOutlinedIcon from '@mui/icons-material/StreamOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import AppPopover from './AppPopover';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import { getSchemas, selectSchema } from '../api';
import { HOVER_CAPABLE_QUERY } from '../styles/mediaQueries';
import logger from '../utils/logger';
import { getToolbarChipSx, UI_LAYOUT } from '../styles/shared';


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

  const showSchemaSelector = useMemo(() =>
    isConnected && isPostgreSQL && schemas.length > 0,
  [isConnected, isPostgreSQL, schemas.length]);
  const showDatabaseSelector = useMemo(() =>
    isConnected && currentDatabase,
  [isConnected, currentDatabase]);
  const canSwitchDatabase = useMemo(() =>
    availableDatabases.length > 1,
  [availableDatabases.length]);

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

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

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
      icon: <CloudUploadOutlinedIcon sx={{ fontSize: 14 }} />,
      prompt: 'Check my database connection status and show connection details',
    },
    {
      label: 'Schema Details',
      icon: <StreamOutlinedIcon sx={{ fontSize: 14 }} />,
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

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        px: { xs: 0.5, sm: 0.75 },
        pb: { xs: 'max(env(safe-area-inset-bottom), 8px)', sm: 0.75 },
      }}
    >
      <AppPopover
        anchorEl={dbAnchor}
        open={Boolean(dbAnchor)}
        onClose={handleCloseDbMenu}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        width={220}
        paperSx={{ mt: -1 }}
      >
        <Typography sx={{ px: 1, pt: 0.5, pb: 0.25, fontSize: '0.635rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'text.disabled', display: 'block', lineHeight: 1 }}>
          Switch Database
        </Typography>
        <Box sx={{ maxHeight: 280, overflowY: 'auto', mt: 0.5 }}>
          {availableDatabases.map((db) => {
            const isActive = db === currentDatabase;
            return (
              <Box
                component="div"
                role="menuitemradio"
                aria-checked={isActive}
                key={db}
                onClick={() => handleDatabaseChange(db)}
                sx={{
                  borderRadius: '8px',
                  px: 1,
                  py: 0.875,
                  minHeight: 32,
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 1,
                  alignItems: 'center',
                  userSelect: 'none',
                  transition: 'background-color 120ms',
                  backgroundColor: isActive ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.08) : 'transparent',
                  '&:hover': { backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? (isActive ? 0.16 : 0.07) : (isActive ? 0.11 : 0.05)) },
                }}
              >
                <Typography sx={{ fontSize: '0.875rem', color: isActive ? 'primary.main' : 'text.primary', lineHeight: 1.4, fontWeight: isActive ? 500 : 400 }}>
                  {db}
                </Typography>
                {isActive && <CheckRoundedIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />}
              </Box>
            );
          })}
        </Box>
      </AppPopover>
      <AppPopover
        anchorEl={schemaAnchor}
        open={Boolean(schemaAnchor)}
        onClose={handleCloseSchemaMenu}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        width={200}
        paperSx={{ mt: -1 }}
      >
        <Typography sx={{ px: 1, pt: 0.5, pb: 0.25, fontSize: '0.635rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'text.disabled', display: 'block', lineHeight: 1 }}>
          PostgreSQL Schema
        </Typography>
        <Box sx={{ maxHeight: 260, overflowY: 'auto', mt: 0.5 }}>
          {schemas.map((schema) => {
            const isActive = schema === currentSchema;
            return (
              <Box
                component="div"
                role="menuitemradio"
                aria-checked={isActive}
                key={schema}
                onClick={() => handleSchemaChange(schema)}
                sx={{
                  borderRadius: '8px',
                  px: 1,
                  py: 0.875,
                  minHeight: 32,
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 1,
                  alignItems: 'center',
                  userSelect: 'none',
                  transition: 'background-color 120ms',
                  backgroundColor: isActive ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.08) : 'transparent',
                  '&:hover': { backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? (isActive ? 0.16 : 0.07) : (isActive ? 0.11 : 0.05)) },
                }}
              >
                <Typography sx={{ fontSize: '0.875rem', color: isActive ? 'primary.main' : 'text.primary', lineHeight: 1.4, fontWeight: isActive ? 500 : 400 }}>
                  {schema}
                </Typography>
                {isActive && <CheckRoundedIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />}
              </Box>
            );
          })}
        </Box>
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
        <Box sx={{ maxHeight: 280, overflowY: 'auto' }}>
          {llmOptionsLoading ? (
            <Box sx={{ display: 'grid', gap: 0.5 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rounded" height={44} sx={{ borderRadius: '8px' }} />
              ))}
            </Box>
          ) : hasLlmOptions ? (
            llmSections.map((section, sectionIndex) => (
              <Box key={section.name}>
                {sectionIndex > 0 && (
                  <Box sx={{ height: '0.5px', backgroundColor: alpha(theme.palette.text.primary, 0.07), my: 0.75, mx: 0.5 }} />
                )}
                <Typography sx={{ px: 1, pt: 0.75, pb: 0.25, fontSize: '0.635rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'text.disabled', display: 'block', lineHeight: 1 }}>
                {section.label}
              </Typography>
          {section.models.map((model) => {
                  const isActive = section.name === selectedProvider && model === selectedModel;
                  return (
                    <Box
                      component="div"
                      role="menuitemradio"
                      aria-checked={isActive}
                      key={`${section.name}-${model}`}
                      onClick={() => handleLlmSelection(section.name, model)}
                      sx={{
                        borderRadius: '8px',
                        px: 1,
                        py: 0.875,
                        minHeight: 32,
                        cursor: 'pointer',
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        gap: 1,
                        alignItems: 'center',
                        userSelect: 'none',
                        transition: 'background-color 120ms',
                        backgroundColor: isActive ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.08) : 'transparent',
                        '&:hover': { backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? (isActive ? 0.16 : 0.07) : (isActive ? 0.11 : 0.05)) },
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontSize: '0.875rem', color: isActive ? 'primary.main' : 'text.primary', lineHeight: 1.4, fontWeight: isActive ? 500 : 400 }}>
                          {model}
                        </Typography>
                        {model === section.defaultModel && (
                          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.3, mt: 0.25 }}>
                            Default
                          </Typography>
                        )}
                      </Box>
                      {isActive && (
                        <CheckRoundedIcon sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }} />
                      )}
                    </Box>
                  );
                })}
              </Box>
            ))
          ) : (
            <Box sx={{ px: 1, py: 1 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>
                No models available
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.25 }}>
                Model options could not be loaded.
              </Typography>
            </Box>
          )}
        </Box>

        {/* Separator */}
        <Box sx={{ height: '0.5px', backgroundColor: alpha(theme.palette.text.primary, 0.07), my: 0.75, mx: 0.5 }} />

        {/* Extended thinking row */}
        <Box
          sx={{
            borderRadius: '8px',
            px: 1,
            py: 0.875,
            minHeight: 32,
            cursor: 'pointer',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 1.5,
            alignItems: 'center',
            transition: 'background-color 150ms, border-color 150ms',
            border: '1px solid',
            borderColor: reasoningEnabled
              ? alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.3 : 0.25)
              : 'transparent',
            backgroundColor: reasoningEnabled
              ? alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.08 : 0.06)
              : 'transparent',
            '&:hover': {
              backgroundColor: reasoningEnabled
                ? alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.13 : 0.1)
                : alpha(theme.palette.text.primary, 0.05),
            },
          }}
          onClick={toggleReasoning}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.875rem', color: reasoningEnabled ? 'success.main' : 'text.primary', lineHeight: 1.4, fontWeight: reasoningEnabled ? 500 : 400, transition: 'color 150ms' }}>
              Extended thinking
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.3, mt: 0.25 }}>
              Think longer for complex tasks
            </Typography>
          </Box>
          <Switch
            checked={reasoningEnabled}
            onChange={toggleReasoning}
            onClick={(e) => e.stopPropagation()}
            inputProps={{ 'aria-label': 'Toggle extended thinking' }}
            sx={{
              width: 36,
              height: 20,
              p: 0,
              flexShrink: 0,
              '& .MuiSwitch-switchBase': {
                p: '2px',
                transitionDuration: '180ms',
                '&.Mui-checked': {
                  transform: 'translateX(16px)',
                  color: theme.palette.common.white,
                  '& + .MuiSwitch-track': { opacity: 1, backgroundColor: theme.palette.success.main },
                },
              },
              '& .MuiSwitch-thumb': { boxShadow: 'none', width: 16, height: 16 },
              '& .MuiSwitch-track': {
                borderRadius: 10,
                opacity: 1,
                backgroundColor: alpha(theme.palette.text.primary, 0.16),
              },
            }}
          />
        </Box>
      </AppPopover>
      <Box
        sx={{
          maxWidth: UI_LAYOUT.chatInputMaxWidth,
          mx: 'auto',
          position: 'relative',
          borderRadius: '20px',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >

        <Box
          sx={{
            m: '1px',
            p: { xs: 1.25, sm: 1.5 },
            borderRadius: '18px',
            position: 'relative',
            zIndex: 1,
            border: '1px solid',
            borderColor: isFocused
              ? alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.26 : 0.18)
              : alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.1),
            backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.94 : 0.98),
            boxShadow: isFocused
              ? `0 10px 24px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.22 : 0.08)}`
              : `0 4px 12px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.16 : 0.05)}`,
            transition: theme.transitions.create(['border-color', 'box-shadow', 'background-color'], {
              duration: theme.transitions.duration.shorter,
            }),
            [HOVER_CAPABLE_QUERY]: {
              '&:hover': {
                borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.22 : 0.15),
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
            sx: {
              lineHeight: 1.5,
              py: 0,
              px: 0,
              color: 'text.primary',
              alignItems: 'flex-start',
            },
          }}
          sx={{
            '& .MuiInputBase-root': { p: 0 },
            '& .MuiInputBase-input': {
              py: 0.1,
              ...theme.typography.uiInput,
              '&::placeholder': {
                color: 'text.secondary',
                opacity: 0.72,
              },
            },
          }}
        />

        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flex: 1, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
            <Tooltip title="Attach file (coming soon)">
              <span>
                <IconButton
                  size="small"
                  disabled
                  aria-label="Attach file (coming soon)"
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: '10px',
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
                  icon={<CloudUploadOutlinedIcon />}
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
                  icon={<StreamOutlinedIcon />}
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

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            <Tooltip title={activeProviderLabel ? `${selectedModel || 'Select model'} - ${activeProviderLabel}` : 'Select model'}>
              <span>
                <ButtonBase
                  onClick={handleOpenLlmPopover}
                  disabled={!hasLlmOptions && !llmOptionsLoading}
                  aria-expanded={Boolean(llmAnchor)}
                  aria-label="Select model"
                  sx={{
                    height: 34,
                    borderRadius: '10px',
                    px: 1.125,
                    gap: 0.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    maxWidth: { xs: 'min(44vw, 144px)', sm: 208 },
                    color: 'text.secondary',
                    backgroundColor: alpha(theme.palette.text.primary, 0.04),
                    ...theme.typography.uiCaptionSm,
                    transition: theme.transitions.create(['background-color', 'color'], { duration: theme.transitions.duration.shorter }),
                    [HOVER_CAPABLE_QUERY]: {
                      '&:hover': { backgroundColor: alpha(theme.palette.text.primary, 0.07) },
                    },
                    '&[aria-expanded="true"]': { backgroundColor: alpha(theme.palette.text.primary, 0.09), color: 'text.primary' },
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
                    width: 34,
                    height: 34,
                    flexShrink: 0,
                    borderRadius: '10px',
                    color: isStreaming
                      ? theme.palette.error.main
                      : (hasText ? theme.palette.getContrastText(theme.palette.primary.main) : alpha(theme.palette.text.primary, 0.28)),
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
                    '&:active': { transform: 'scale(0.96)' },
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
      </Box>
      {showSuggestions && (
        <Box sx={{ maxWidth: UI_LAYOUT.chatInputMaxWidth, mx: 'auto', mt: 1.25, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {suggestions.map((chip) => (
            <Chip
              key={chip.label}
              icon={chip.icon}
              label={chip.label}
              onClick={() => handleSuggestionClick(chip.prompt)}
              size="small"
              sx={{
                height: 34,
                borderRadius: '10px',
                border: '1px solid',
                borderColor: alpha(theme.palette.text.primary, 0.12),
                color: 'text.secondary',
                backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.32 : 0.72),
                cursor: 'pointer',
                '& .MuiChip-label': {
                  px: 1.125,
                  ...theme.typography.uiCaptionSm,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                },
                '& .MuiChip-icon': { color: 'inherit', ml: 0.875, mr: -0.125, fontSize: 14, display: 'flex', alignItems: 'center' },
                [HOVER_CAPABLE_QUERY]: {
                  '&:hover': {
                    borderColor: alpha(theme.palette.text.primary, 0.22),
                    backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.48 : 0.9),
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
          mt: 1,
          px: 1,
          ...theme.typography.uiCaption2xs,
          color: 'text.secondary',
          opacity: 0.55,
          letterSpacing: '0.015em',
        }}
      >
        Moonlit can make mistakes. Verify important info.
      </Typography>
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
