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
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import CableOutlinedIcon from '@mui/icons-material/CableOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import BubbleChartRoundedIcon from '@mui/icons-material/BubbleChartRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';

// Centralized API layer
import { getSchemas, selectSchema } from '../api';
import logger from '../utils/logger';

// ============================================================================
// STATIC STYLES - Moved outside to prevent recreation
// ============================================================================
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
}) {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Context for reasoning state
  const { settings, updateSetting } = useAppTheme();
  const reasoningEnabled = settings.enableReasoning ?? true;

  // Schema state
  const [schemas, setSchemas] = useState([]);
  const [currentSchema, setCurrentSchema] = useState('public');
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaAnchor, setSchemaAnchor] = useState(null);

  // Database menu anchor
  const [dbAnchor, setDbAnchor] = useState(null);

  // ============================================================================
  // MEMOIZED DERIVED VALUES
  // ============================================================================

  const isPostgreSQL = useMemo(() =>
    dbType?.toLowerCase() === 'postgresql',
    [dbType]
  );

  const isSQLite = useMemo(() =>
    dbType?.toLowerCase() === 'sqlite',
    [dbType]
  );

  const showSchemaSelector = useMemo(() =>
    isConnected && isPostgreSQL && schemas.length > 0,
    [isConnected, isPostgreSQL, schemas.length]
  );

  // Show database chip if connected (for display), but only make it clickable if multiple DBs
  const showDatabaseSelector = useMemo(() =>
    isConnected && currentDatabase,
    [isConnected, currentDatabase]
  );

  // Only allow switching if there are multiple databases (not for SQLite)
  const canSwitchDatabase = useMemo(() =>
    availableDatabases.length > 1 && !isSQLite,
    [availableDatabases.length, isSQLite]
  );

  const hasText = useMemo(() =>
    message.trim().length > 0,
    [message]
  );

  // ============================================================================
  // MEMOIZED STYLES
  // ============================================================================

  const toolbarChipStyles = useMemo(() => ({
    height: 26,
    borderRadius: '12px',
    border: '1px solid',
    borderColor: alpha(theme.palette.text.primary, 0.2), // Increased from 0.12 for dark theme visibility
    backgroundColor: alpha(theme.palette.text.primary, 0.04),
    '&:hover': {
      borderColor: alpha(theme.palette.text.primary, 0.35),
      backgroundColor: alpha(theme.palette.text.primary, 0.08),
    },
  }), [theme]);

  // ============================================================================
  // STABLE MENU CLOSE HANDLERS
  // ============================================================================

  const handleCloseDbMenu = useCallback(() => setDbAnchor(null), []);
  const handleCloseSchemaMenu = useCallback(() => setSchemaAnchor(null), []);

  // ============================================================================
  // MEMOIZED HANDLERS
  // ============================================================================

  const toggleHidden = useCallback(() => {
    setIsHidden(prev => !prev);
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

  const handleOpenSqlEditorClick = useCallback(() => {
    onOpenSqlEditor?.();
  }, [onOpenSqlEditor]);

  const handleStopClick = useCallback(() => {
    onStop?.();
  }, [onStop]);

  // ============================================================================
  // MEMOIZED SUGGESTIONS
  // ============================================================================

  const suggestions = useMemo(() => [
    {
      label: 'Check Connection',
      icon: <CableOutlinedIcon sx={{ fontSize: 14 }} />,
      prompt: 'Check my database connection status and show connection details',
    },
    {
      label: 'Schema Details',
      icon: <AccountTreeOutlinedIcon sx={{ fontSize: 14 }} />,
      prompt: 'Show me the database schema with all tables and their columns',
    },
    {
      label: 'Recent Queries',
      icon: <HistoryOutlinedIcon sx={{ fontSize: 14 }} />,
      prompt: 'Show me the most recently executed SQL queries in this session',
    },
  ], []);

  const handleSuggestionClick = useCallback((prompt) => {
    onSend?.(prompt);
  }, [onSend]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    if (isConnected && currentDatabase && isPostgreSQL) {
      fetchSchemas();
    } else {
      setSchemas([]);
      setCurrentSchema('public');
    }
  }, [isConnected, currentDatabase, isPostgreSQL, fetchSchemas]);

  // ============================================================================
  // MEMOIZED HELPER
  // ============================================================================

  const getMenuItemIcon = useCallback((isSelected, defaultIcon) =>
    isSelected
      ? <CheckRoundedIcon sx={{ fontSize: 16, color: 'success.main' }} />
      : defaultIcon,
    []
  );

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Box sx={{ position: 'relative' }}>
      {/* Floating show button when hidden */}
      <Collapse in={isHidden} timeout={200}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            py: 1,
          }}
        >
          <Tooltip title="Show input" arrow>
            <Fab
              size="small"
              onClick={toggleHidden}
              aria-label="Show message input"
              sx={{
                backgroundColor: isDarkMode
                  ? alpha(theme.palette.common.white, 0.08)
                  : alpha(theme.palette.common.black, 0.05),
                border: '1px solid',
                borderColor: theme.palette.divider,
                boxShadow: 'none',
                '&:hover': {
                  backgroundColor: isDarkMode
                    ? alpha(theme.palette.common.white, 0.12)
                    : alpha(theme.palette.common.black, 0.08),
                  boxShadow: 'none',
                },
              }}
            >
              <KeyboardArrowUpRoundedIcon sx={{ color: 'text.secondary' }} />
            </Fab>
          </Tooltip>
        </Box>
      </Collapse>

      {/* Main input section - collapsible */}
      <Collapse in={!isHidden} timeout={300}>
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            p: { xs: 2, sm: 3 },
            pb: { xs: 2, sm: 2.5 },
          }}
        >
          {/* Toolbar - Compact row above input */}
          {(showDatabaseSelector || showSchemaSelector || onOpenSqlEditor) && (
            <Box
              sx={{
                maxWidth: 760,
                mx: 'auto',
                mb: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5,
                flexWrap: 'wrap',
              }}
            >
              {showDatabaseSelector && (
                <Tooltip title={canSwitchDatabase ? `Database: ${currentDatabase} (click to switch)` : `Database: ${currentDatabase}`}>
                  <Chip
                    icon={<StorageOutlinedIcon sx={{ fontSize: 14 }} />}
                    label={currentDatabase}
                    onClick={canSwitchDatabase ? handleOpenDbMenu : undefined}
                    size="small"
                    sx={{
                      ...toolbarChipStyles,
                      cursor: canSwitchDatabase ? 'pointer' : 'default',
                    }}
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
          )}

          {/* Database Menu */}
          <Menu
            anchorEl={dbAnchor}
            open={Boolean(dbAnchor)}
            onClose={handleCloseDbMenu}
            PaperProps={{ sx: { minWidth: 180, maxHeight: 320 } }}
          >
            <Typography variant="overline" sx={MENU_HEADER_STYLES}>
              Switch Database
            </Typography>
            {availableDatabases.map((db) => (
              <MenuItem
                key={db}
                onClick={() => handleDatabaseChange(db)}
                selected={db === currentDatabase}
              >
                <ListItemIcon sx={LIST_ITEM_ICON_STYLES}>
                  {getMenuItemIcon(db === currentDatabase, <StorageOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />)}
                </ListItemIcon>
                <ListItemText primary={db} />
              </MenuItem>
            ))}
          </Menu>

          {/* Schema Menu */}
          <Menu
            anchorEl={schemaAnchor}
            open={Boolean(schemaAnchor)}
            onClose={handleCloseSchemaMenu}
            PaperProps={{ sx: { minWidth: 160, maxHeight: 280 } }}
          >
            <Typography variant="overline" sx={MENU_HEADER_STYLES}>
              PostgreSQL Schema
            </Typography>
            {schemas.map((schema) => (
              <MenuItem
                key={schema}
                onClick={() => handleSchemaChange(schema)}
                selected={schema === currentSchema}
              >
                <ListItemIcon sx={LIST_ITEM_ICON_STYLES}>
                  {getMenuItemIcon(schema === currentSchema, <AccountTreeOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />)}
                </ListItemIcon>
                <ListItemText primary={schema} />
              </MenuItem>
            ))}
          </Menu>

          {/* Input Container */}
          <Box
            sx={{
              maxWidth: 760,
              mx: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: { xs: 1.5, sm: 2 },
              py: { xs: 1, sm: 1.25 },
              borderRadius: '28px',
              border: '1px solid',
              borderColor: isFocused
                ? alpha(theme.palette.text.primary, 0.2)
                : alpha(theme.palette.text.primary, 0.1),
              backgroundColor: alpha(theme.palette.text.primary, 0.04),
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              transition: theme.transitions.create(
                ['border-color', 'background-color', 'box-shadow'],
                { duration: theme.transitions.duration.short }
              ),
              '&:hover': {
                borderColor: alpha(theme.palette.text.primary, 0.15),
              },
            }}
          >
            {/* Left Actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
              <Tooltip title="Attach file (coming soon)">
                <span>
                  <IconButton
                    size="small"
                    disabled
                    aria-label="Attach file (coming soon)"
                    sx={{
                      color: 'text.secondary',
                      opacity: 0.4,
                      width: 32,
                      height: 32,
                    }}
                  >
                    <AttachFileRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title={reasoningEnabled ? 'Thinking enabled (click to disable)' : 'Thinking disabled (click to enable)'}>
                <IconButton
                  size="small"
                  onClick={toggleReasoning}
                  aria-label={reasoningEnabled ? 'Disable AI thinking' : 'Enable AI thinking'}
                  aria-pressed={reasoningEnabled}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: reasoningEnabled 
                      ? alpha(theme.palette.text.primary, isDarkMode ? 0.4 : 0.3)
                      : 'transparent',
                    backgroundColor: reasoningEnabled 
                      ? alpha(theme.palette.text.primary, isDarkMode ? 0.12 : 0.08)
                      : 'transparent',
                    color: reasoningEnabled 
                      ? theme.palette.text.primary
                      : alpha(theme.palette.text.secondary, 0.4),
                    transition: theme.transitions.create(
                      ['background-color', 'border-color', 'color', 'transform'],
                      { duration: 150 }
                    ),
                    '&:hover': {
                      backgroundColor: reasoningEnabled
                        ? alpha(theme.palette.text.primary, isDarkMode ? 0.18 : 0.12)
                        : alpha(theme.palette.text.primary, 0.06),
                      borderColor: reasoningEnabled
                        ? alpha(theme.palette.text.primary, isDarkMode ? 0.5 : 0.4)
                        : alpha(theme.palette.text.primary, 0.15),
                      color: theme.palette.text.primary,
                    },
                    '&:active': {
                      transform: 'scale(0.95)',
                    },
                  }}
                >
                  <BubbleChartRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Input Field */}
            <TextField
              fullWidth
              multiline
              maxRows={5}
              placeholder="Ask anything..."
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
                  lineHeight: 1.6,
                  py: 0.5,
                  color: 'text.primary',
                },
              }}
              sx={{
                '& .MuiInputBase-root': {
                  p: 0,
                  alignItems: 'center',
                },
                '& .MuiInputBase-input': {
                  py: 0,
                  '&::placeholder': {
                    color: 'text.secondary',
                    opacity: 0.7,
                  },
                },
              }}
            />

            {/* Hide button */}
            <Tooltip title="Hide input">
              <IconButton
                size="small"
                onClick={toggleHidden}
                aria-label="Hide message input"
                sx={{
                  width: 32,
                  height: 32,
                  color: 'text.disabled',
                  flexShrink: 0,
                  '&:hover': { color: 'text.secondary' },
                }}
              >
                <KeyboardArrowDownRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>

            {/* Send/Stop Button */}
            <Tooltip title={isStreaming ? 'Stop generating' : (hasText ? 'Send message' : 'Type a message')}>
              <span>
                <IconButton
                  type={isStreaming ? 'button' : 'submit'}
                  onClick={isStreaming ? handleStopClick : undefined}
                  disabled={!isStreaming && (!hasText || disabled)}
                  aria-label={isStreaming ? 'Stop generating response' : 'Send message'}
                  sx={{
                    width: 36,
                    height: 36,
                    color: (hasText || isStreaming)
                      ? (isStreaming ? theme.palette.error.main : theme.palette.text.primary)
                      : 'text.disabled',
                    borderColor: (hasText || isStreaming)
                      ? (isStreaming ? alpha(theme.palette.error.main, 0.5) : alpha(theme.palette.text.primary, 0.5))
                      : undefined,
                    transition: 'transform 0.2s ease',
                    flexShrink: 0,
                    '&:hover': {
                      backgroundColor: (hasText || isStreaming)
                        ? (isStreaming
                          ? alpha(theme.palette.error.main, 0.1)
                          : alpha(theme.palette.text.primary, 0.1))
                        : undefined,
                      borderColor: (hasText || isStreaming)
                        ? (isStreaming ? theme.palette.error.main : theme.palette.text.primary)
                        : undefined,
                    },
                  }}
                >
                  {isStreaming ? (
                    <StopRoundedIcon sx={{ fontSize: 18 }} />
                  ) : (
                    <SendRoundedIcon sx={{ fontSize: 18, ml: 0.25 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          {/* Suggestion Chips */}
          {showSuggestions && (
            <Box
              sx={{
                maxWidth: 760,
                mx: 'auto',
                mt: 1.5,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              {suggestions.map((chip) => (
                <Chip
                  key={chip.label}
                  icon={chip.icon}
                  label={chip.label}
                  onClick={() => handleSuggestionClick(chip.prompt)}
                  size="small"
                  sx={{
                    borderRadius: '12px',
                    border: '1px solid', // Explicit border style
                    borderColor: alpha(theme.palette.text.primary, 0.2), // Increased for dark theme visibility
                    color: 'text.secondary',
                    height: 30,
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, border-color 0.15s ease',
                    '& .MuiChip-icon': {
                      color: 'inherit',
                      ml: 0.5,
                    },
                    '&:hover': {
                      borderColor: alpha(theme.palette.text.primary, 0.35),
                      backgroundColor: alpha(theme.palette.text.primary, 0.06),
                      color: 'text.primary',
                    },
                  }}
                />
              ))}
            </Box>
          )}

          {/* Footer hint */}
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textAlign: 'center',
              mt: 1.5,
              color: 'text.secondary',
              opacity: 0.4,
            }}
          >
            AI-powered • Always verify SQL queries before running
          </Typography>
        </Box>
      </Collapse>
    </Box>
  );
}

// Custom memo comparison for stable props
function arePropsEqual(prevProps, nextProps) {
  // Check primitives
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  if (prevProps.disabled !== nextProps.disabled) return false;
  if (prevProps.isConnected !== nextProps.isConnected) return false;
  if (prevProps.dbType !== nextProps.dbType) return false;
  if (prevProps.currentDatabase !== nextProps.currentDatabase) return false;
  if (prevProps.showSuggestions !== nextProps.showSuggestions) return false;

  // Check array length
  if (prevProps.availableDatabases?.length !== nextProps.availableDatabases?.length) return false;

  // Check function refs (these should be stable from parent)
  // We assume parent provides stable callbacks via useCallback
  return true;
}

export default memo(ChatInput, arePropsEqual);
