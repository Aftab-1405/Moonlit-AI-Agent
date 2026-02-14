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
  useMediaQuery,
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
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import { getSchemas, selectSchema } from '../api';
import logger from '../utils/logger';

const REDUCED_MOTION_QUERY = '@media (prefers-reduced-motion: reduce)';
const HOVER_CAPABLE_QUERY = '@media (hover: hover) and (pointer: fine)';
const BACKDROP_FILTER_FALLBACK_QUERY =
  '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))';

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
  const isCompactMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { settings, updateSetting } = useAppTheme();
  const reasoningEnabled = settings.enableReasoning ?? true;
  const [schemas, setSchemas] = useState([]);
  const [currentSchema, setCurrentSchema] = useState('public');
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaAnchor, setSchemaAnchor] = useState(null);
  const [dbAnchor, setDbAnchor] = useState(null);

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
  const showDatabaseSelector = useMemo(() =>
    isConnected && currentDatabase,
    [isConnected, currentDatabase]
  );
  const canSwitchDatabase = useMemo(() =>
    availableDatabases.length > 1 && !isSQLite,
    [availableDatabases.length, isSQLite]
  );

  const hasText = useMemo(() =>
    message.trim().length > 0,
    [message]
  );

  const toolbarChipStyles = useMemo(() => ({
    height: isCompactMobile ? 28 : 26,
    borderRadius: '12px',
    border: '1px solid',
    borderColor: alpha(theme.palette.text.primary, 0.2), // Increased from 0.12 for dark theme visibility
    backgroundColor: alpha(theme.palette.text.primary, 0.04),
    '& .MuiChip-label': {
      px: isCompactMobile ? 0.75 : 1,
    },
    [HOVER_CAPABLE_QUERY]: {
      '&:hover': {
        borderColor: alpha(theme.palette.text.primary, 0.35),
        backgroundColor: alpha(theme.palette.text.primary, 0.08),
      },
    },
  }), [theme, isCompactMobile]);
  const inputPlaceholder = isConnected
    ? (isCompactMobile ? 'Ask about database...' : 'Ask about your database...')
    : 'Ask anything...';

  const handleCloseDbMenu = useCallback(() => setDbAnchor(null), []);
  const handleCloseSchemaMenu = useCallback(() => setSchemaAnchor(null), []);

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
    []
  );

  return (
    <Box sx={{ position: 'relative' }}>
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
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            p: { xs: 1, sm: 3 },
            pb: { xs: 'max(env(safe-area-inset-bottom), 10px)', sm: 2.5 },
          }}
        >
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
          <Menu
            anchorEl={dbAnchor}
            open={Boolean(dbAnchor)}
            onClose={handleCloseDbMenu}
            PaperProps={{
              sx: { minWidth: 180,
                maxHeight: 320,
                '& .MuiMenuItem-root': { minHeight: { xs: 40, sm: 36 } },
              },
            }}
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
          <Menu
            anchorEl={schemaAnchor}
            open={Boolean(schemaAnchor)}
            onClose={handleCloseSchemaMenu}
            PaperProps={{
              sx: { minWidth: 160,
                maxHeight: 280,
                '& .MuiMenuItem-root': { minHeight: { xs: 40, sm: 36 } },
              },
            }}
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
          <Box
            sx={{
              maxWidth: 760,
              mx: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 0.5, sm: 0.75 },
              px: { xs: 1.1, sm: 2 },
              py: { xs: 0.75, sm: 1.25 },
              borderRadius: { xs: '20px', sm: '28px' },
              border: '1px solid',
              borderColor: isFocused
                ? alpha(theme.palette.text.primary, 0.2)
                : alpha(theme.palette.text.primary, 0.1),
              backgroundColor: alpha(theme.palette.text.primary, 0.04),
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              [BACKDROP_FILTER_FALLBACK_QUERY]: {
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
              },
              [theme.breakpoints.down('sm')]: {
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
              },
              transition: theme.transitions.create(
                ['border-color', 'background-color', 'box-shadow'],
                { duration: theme.transitions.duration.short }
              ),
              [HOVER_CAPABLE_QUERY]: {
                '&:hover': {
                  borderColor: alpha(theme.palette.text.primary, 0.15),
                },
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
              {!isCompactMobile && (
                <Tooltip title="Attach file (coming soon)">
                  <span>
                    <IconButton
                      size="small"
                      disabled
                      aria-label="Attach file (coming soon)"
                      sx={{
                        color: 'text.secondary',
                        opacity: 0.4,
                        width: 44,
                        height: 44,
                      }}
                    >
                      <AttachFileRoundedIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              )}

              <Tooltip title={reasoningEnabled ? 'Thinking enabled (click to disable)' : 'Thinking disabled (click to enable)'}>
                <IconButton
                  size="small"
                  onClick={toggleReasoning}
                  aria-label={reasoningEnabled ? 'Disable AI thinking' : 'Enable AI thinking'}
                  aria-pressed={reasoningEnabled}
                  sx={{
                    width: 44,
                    height: 44,
                    color: reasoningEnabled
                      ? theme.palette.info.main
                      : alpha(theme.palette.text.secondary, 0.4),
                    transition: theme.transitions.create(['color'], { duration: 150 }),
                    '&:hover': { backgroundColor: 'transparent' },
                  }}
                >
                  <AccessTimeRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Box>
            <TextField
              fullWidth
              multiline
              maxRows={isCompactMobile ? 4 : 5}
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
                sx: { lineHeight: 1.6,
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
                  fontSize: { xs: '1rem', sm: '0.95rem' },
                  '&::placeholder': {
                    color: 'text.secondary',
                    opacity: 0.7,
                  },
                },
              }}
            />
            <Tooltip title="Hide input">
              <IconButton
                size="small"
                onClick={toggleHidden}
                aria-label="Hide message input"
                sx={{
                  width: 44,
                  height: 44,
                  color: 'text.disabled',
                  flexShrink: 0,
                  display: isCompactMobile ? 'none' : 'inline-flex',
                  '&:hover': { backgroundColor: 'transparent' },
                }}
              >
                <KeyboardArrowDownRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={isStreaming ? 'Stop generating' : (hasText ? 'Send message' : 'Type a message')}>
              <span>
                <IconButton
                  type={isStreaming ? 'button' : 'submit'}
                  onClick={isStreaming ? handleStopClick : undefined}
                  disabled={!isStreaming && (!hasText || disabled)}
                  aria-label={isStreaming ? 'Stop generating response' : 'Send message'}
                  sx={{
                    width: 44,
                    height: 44,
                    color: (hasText || isStreaming)
                      ? (isStreaming ? theme.palette.error.main : theme.palette.text.primary)
                      : 'text.disabled',
                    flexShrink: 0,
                    '&:hover': { backgroundColor: 'transparent' },
                  }}
                >
                  {isStreaming ? (
                    <StopRoundedIcon sx={{ fontSize: 20 }} />
                  ) : (
                    <SendRoundedIcon sx={{ fontSize: 20, ml: 0.25 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
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
                    borderColor: alpha(theme.palette.text.primary, 0.2),
                    color: 'text.secondary',
                    height: 30,
                    backgroundColor: 'transparent',
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
                        borderColor: alpha(theme.palette.text.primary, 0.35),
                        backgroundColor: alpha(theme.palette.text.primary, 0.06),
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
              fontSize: { xs: '0.68rem', sm: '0.75rem' },
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
  if (prevProps.onSend !== nextProps.onSend) return false;
  if (prevProps.onStop !== nextProps.onStop) return false;
  if (prevProps.onOpenSqlEditor !== nextProps.onOpenSqlEditor) return false;
  if (prevProps.onDatabaseSwitch !== nextProps.onDatabaseSwitch) return false;
  if (prevProps.availableDatabases?.length !== nextProps.availableDatabases?.length) return false;
  return true;
}

export default memo(ChatInput, arePropsEqual);

