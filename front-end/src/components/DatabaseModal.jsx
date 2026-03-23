import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import {
  Box,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  useMediaQuery,
  Slide,
  Stack,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Fade,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Drawer,
  Divider,
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { useSettings } from '../contexts/SettingsContext';
import { useLocalStorage } from '../hooks';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import PowerSettingsNewRoundedIcon from '@mui/icons-material/PowerSettingsNewRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import {
  getDatabases,
  connectDb,
  disconnectDb,
  switchDatabase,
  selectDatabase,
} from '../api';
import {
  useFormValidation,
  credentialsSchema,
  connectionStringSchema,
  sqliteSchema,
  dbFieldSchemas,
} from '../validation';
import { DB_TYPES } from '../config/databases';
import DialogShell from './DialogShell';
import {
  DIALOG_VIEWPORT_SUPPORT_QUERY,
  getCompactActionSx,
  getDialogNavPaneSx,
  getInsetPanelSx,
  UI_LAYOUT,
} from '../styles/shared';
import logger from '../utils/logger';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

function FormCard({ title, children, sx = {} }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        ...getInsetPanelSx(theme),
        p: { xs: 2, sm: 2.5 },
        ...sx,
      }}
    >
      {title ? (
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 2, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </Typography>
      ) : null}
      {children}
    </Box>
  );
}

const VisibilityToggleAdornment = memo(({ show, onToggle }) => (
  <InputAdornment position="end">
    <IconButton
      size="small"
      onClick={onToggle}
      edge="end"
      aria-label={show ? 'Hide password' : 'Show password'}
      sx={(theme) => getCompactActionSx(theme)}
    >
      {show ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
    </IconButton>
  </InputAdornment>
));

function EmptyState({ icon, title, subtitle }) {
  const Icon = icon;
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 3 }}>
      <Icon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
      <Typography variant="body2" color="text.secondary" fontWeight={500}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}

const DatabaseList = memo(({ databases, currentDatabase, onSelect, loading }) => {
  const theme = useTheme();

  if (databases.length === 0) {
    return (
      <EmptyState
        icon={StorageRoundedIcon}
        title="No databases found"
        subtitle="Connect to a server first"
      />
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {databases.map((db) => {
        const isSelected = db === currentDatabase;
        return (
          <Box
            key={db}
            onClick={() => !loading && onSelect(db)}
            sx={{
              p: 1.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: isSelected ? 'primary.main' : 'divider',
              backgroundColor: isSelected ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.15s ease',
              minHeight: { xs: UI_LAYOUT.touchTarget, sm: 0 },
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              '&:hover': !loading ? {
                borderColor: isSelected ? 'primary.main' : alpha(theme.palette.text.primary, 0.2),
                backgroundColor: isSelected ? alpha(theme.palette.primary.main, 0.12) : alpha(theme.palette.text.primary, 0.04),
              } : undefined,
            }}
          >
            {isSelected ? (
              <CheckRoundedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            ) : (
              <StorageRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            )}
            <Typography
              variant="body2"
              fontWeight={isSelected ? 600 : 500}
              color={isSelected ? 'primary.main' : 'text.primary'}
            >
              {db}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
});

function DatabaseModal({ open, onClose, onConnect, isConnected, currentDatabase }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { settings } = useSettings();
  const defaultDbType = settings.defaultDbType || 'postgresql';
  const rememberConnection = settings.rememberConnection ?? false;
  const [savedConnection, setSavedConnection] = useLocalStorage('moonlit-saved-connection', null);
  const [dbType, setDbType] = useState(defaultDbType);
  const [connectionMode, setConnectionMode] = useState('credentials');
  const [connectionString, setConnectionString] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState('connect');
  const [formData, setFormData] = useState({
    host: 'localhost',
    port: '5432',
    user: '',
    password: '',
    database: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConnectionString, setShowConnectionString] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [databases, setDatabases] = useState([]);
  const [isRemote, setIsRemote] = useState(false);
  const { errors: fieldErrors, validateForm, clearError } = useFormValidation(dbFieldSchemas);
  const timeoutRefs = useRef([]);
  const currentDbConfig = useMemo(() => DB_TYPES.find((db) => db.value === dbType) || DB_TYPES[1], [dbType]);
  const isSQLite = dbType === 'sqlite';
  const supportsConnectionString = currentDbConfig.supportsConnectionString;
  const hasDatabases = databases.length > 0;
  const mobileHeaderTitle = mobileSection === 'databases' ? 'Available Databases' : 'Connection Details';

  useEffect(() => () => timeoutRefs.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (rememberConnection && open && savedConnection) {
      if (savedConnection.dbType) setDbType(savedConnection.dbType);
      if (savedConnection.connectionMode) setConnectionMode(savedConnection.connectionMode);
      if (savedConnection.formData) {
        setFormData((prev) => ({ ...prev, ...savedConnection.formData }));
      }
    }
  }, [open, rememberConnection, savedConnection]);

  const fetchDatabases = useCallback(async () => {
    try {
      const data = await getDatabases();
      if (data.status === 'success' && data.databases) {
        setDatabases(data.databases);
        if (data.is_remote) {
          setIsRemote(true);
          if (data.db_type) {
            setDbType(data.db_type);
          }
          setConnectionMode('connection_string');
        }
      }
    } catch (err) {
      logger.error('Failed to fetch databases:', err);
    }
  }, []);

  useEffect(() => {
    if (open && isConnected && databases.length === 0) {
      fetchDatabases();
    }
  }, [open, isConnected, databases.length, fetchDatabases]);

  useEffect(() => {
    if (!hasDatabases && mobileSection === 'databases') {
      setMobileSection('connect');
    }
  }, [hasDatabases, mobileSection]);

  const safeSetTimeout = useCallback((callback, delay) => {
    const id = setTimeout(callback, delay);
    timeoutRefs.current.push(id);
    return id;
  }, []);

  const handleDbTypeChange = useCallback((newValue) => {
    setDbType(newValue);
    const dbConfig = DB_TYPES.find((db) => db.value === newValue);
    setFormData((prev) => ({
      ...prev,
      port: dbConfig?.defaultPort?.toString() || '',
    }));
    setError(null);
    if (isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  const handleInputChange = useCallback((event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    clearError(name);
    setError(null);
  }, [clearError]);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let payload;
      let isValid = false;

      if (isSQLite) {
        isValid = validateForm(sqliteSchema, { database: formData.database });
        payload = { db_type: dbType, db_name: formData.database };
      } else if (connectionMode === 'connection_string' && supportsConnectionString) {
        isValid = validateForm(connectionStringSchema, { connectionString });
        payload = { db_type: dbType, connection_string: connectionString };
      } else {
        isValid = validateForm(credentialsSchema, formData);
        payload = { db_type: dbType, ...formData };
      }

      if (!isValid) {
        setLoading(false);
        return;
      }

      const data = await connectDb(payload);

      if (data.status === 'connected') {
        setSuccess(data.message);
        setDatabases(data.schemas || []);
        setIsRemote(data.is_remote || false);
        onConnect?.({ ...data, db_type: dbType });

        if (rememberConnection) {
          setSavedConnection({
            dbType,
            connectionMode,
            formData: {
              host: formData.host,
              port: formData.port,
              user: formData.user,
              database: formData.database,
            },
          });
        }

        if (data.is_remote && data.selectedDatabase) {
          safeSetTimeout(() => onClose(), 1500);
        }
      } else {
        setError(data.message || 'Failed to connect');
      }
    } catch (err) {
      setError(err.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  }, [
    connectionMode,
    connectionString,
    dbType,
    formData,
    isSQLite,
    onClose,
    onConnect,
    rememberConnection,
    safeSetTimeout,
    setSavedConnection,
    supportsConnectionString,
    validateForm,
  ]);

  const handleSelectDatabase = useCallback(async (dbName) => {
    setLoading(true);
    setError(null);
    try {
      const data = isRemote ? await switchDatabase(dbName) : await selectDatabase(dbName);
      if (data.status === 'connected') {
        setSuccess(`Switched to ${dbName}`);
        onConnect?.({ ...data, selectedDatabase: dbName });
        safeSetTimeout(() => onClose(), 1000);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(err.message || 'Failed to select database');
    } finally {
      setLoading(false);
    }
  }, [isRemote, onClose, onConnect, safeSetTimeout]);

  const handleDisconnect = useCallback(async () => {
    setLoading(true);
    try {
      await disconnectDb();
      setDatabases([]);
      setSuccess(null);
      onConnect?.(null);
    } catch (err) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  }, [onConnect]);

  const navContent = (
    <List sx={{ p: 1.5 }}>
      {DB_TYPES.map((type) => (
        <ListItemButton
          key={type.value}
          selected={dbType === type.value}
          onClick={() => handleDbTypeChange(type.value)}
          sx={{
            borderRadius: 1.5,
            mb: 0.5,
            py: 1.25,
            '&.Mui-selected': {
              backgroundColor: alpha(theme.palette.text.primary, 0.08),
              '&:hover': {
                backgroundColor: alpha(theme.palette.text.primary, 0.12),
              },
            },
          }}
        >
          <ListItemIcon sx={{ minWidth: 36 }}>
            <Box
              component="img"
              src={type.icon}
              alt={type.label}
              sx={{ width: 20, height: 20, objectFit: 'contain' }}
            />
          </ListItemIcon>
          <ListItemText
            primary={type.label}
            primaryTypographyProps={{
              variant: 'body2',
              fontWeight: dbType === type.value ? 600 : 500,
            }}
          />
        </ListItemButton>
      ))}
    </List>
  );

  const renderConnectionForm = () => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5,
        '& .MuiInputBase-input': {
          ...theme.typography.uiInput,
        },
      }}
    >
      {!isSQLite && supportsConnectionString ? (
        <FormCard>
          <ToggleButtonGroup
            value={connectionMode}
            exclusive
            onChange={(event, value) => value && setConnectionMode(value)}
            fullWidth
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                py: 1,
                gap: 1,
                minHeight: { xs: UI_LAYOUT.compactTouchTarget, sm: 36 },
              },
            }}
          >
            <ToggleButton value="credentials">
              <HomeRoundedIcon sx={{ fontSize: 18 }} />
              <Typography variant="body2" fontWeight={500}>Local</Typography>
            </ToggleButton>
            <ToggleButton value="connection_string">
              <LinkRoundedIcon sx={{ fontSize: 18 }} />
              <Typography variant="body2" fontWeight={500}>Remote</Typography>
            </ToggleButton>
          </ToggleButtonGroup>
        </FormCard>
      ) : null}
      <FormCard title="Connection Details">
        {isSQLite ? (
          <TextField
            fullWidth
            name="database"
            label="Database Path"
            placeholder="e.g., C:\\data\\mydb.sqlite"
            value={formData.database}
            onChange={handleInputChange}
            error={!!fieldErrors.database}
            helperText={fieldErrors.database || 'Full path to your SQLite file'}
            size="small"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Paste from clipboard">
                    <IconButton
                      size="small"
                      aria-label="Paste path from clipboard"
                      sx={getCompactActionSx(theme)}
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text) setFormData((prev) => ({ ...prev, database: text.trim() }));
                        } catch (err) {
                          logger.warn('Clipboard access denied:', err);
                        }
                      }}
                    >
                      <FolderOpenOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
          />
        ) : connectionMode === 'connection_string' && supportsConnectionString ? (
          <TextField
            fullWidth
            label="Connection String"
            value={connectionString}
            onChange={(event) => {
              setConnectionString(event.target.value);
              clearError('connectionString');
            }}
            type={showConnectionString ? 'text' : 'password'}
            error={!!fieldErrors.connectionString}
            helperText={fieldErrors.connectionString || 'e.g., postgresql://user:pass@host:5432/db'}
            size="small"
            InputProps={{
              endAdornment: <VisibilityToggleAdornment show={showConnectionString} onToggle={() => setShowConnectionString(!showConnectionString)} />,
            }}
          />
        ) : (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                name="host"
                label="Host"
                placeholder="localhost"
                value={formData.host}
                onChange={handleInputChange}
                error={!!fieldErrors.host}
                helperText={fieldErrors.host}
                size="small"
              />
              <TextField
                sx={{ width: { xs: '100%', sm: 100 }, flexShrink: 0 }}
                name="port"
                label="Port"
                value={formData.port}
                onChange={handleInputChange}
                error={!!fieldErrors.port}
                size="small"
              />
            </Stack>
            <TextField
              fullWidth
              name="user"
              label="Username"
              autoCapitalize="none"
              value={formData.user}
              onChange={handleInputChange}
              error={!!fieldErrors.user}
              size="small"
            />
            <TextField
              fullWidth
              name="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleInputChange}
              error={!!fieldErrors.password}
              size="small"
              InputProps={{
                endAdornment: <VisibilityToggleAdornment show={showPassword} onToggle={() => setShowPassword(!showPassword)} />,
              }}
            />
            <TextField
              fullWidth
              name="database"
              label="Database (Optional)"
              value={formData.database}
              onChange={handleInputChange}
              autoCapitalize="none"
              size="small"
            />
          </Stack>
        )}
      </FormCard>
      {error ? <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert> : null}
      {success ? <Alert severity="success" sx={{ borderRadius: 2 }}>{success}</Alert> : null}
    </Box>
  );

  const renderDatabaseSection = (sx = {}) => (
    <Box
      sx={{
        width: { xs: '100%', sm: 280 },
        flexShrink: 0,
        p: { xs: 2, sm: 3 },
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        backgroundColor: alpha(theme.palette.background.default, 0.5),
        ...sx,
      }}
    >
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 2, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Available Databases
      </Typography>
      <DatabaseList
        databases={databases}
        currentDatabase={currentDatabase}
        onSelect={handleSelectDatabase}
        loading={loading}
      />
    </Box>
  );

  const mobileNavButton = isMobile ? (
    <IconButton
      size="small"
      onClick={() => setMobileNavOpen(true)}
      aria-label="Open database type menu"
      sx={getCompactActionSx(theme)}
    >
      <MenuRoundedIcon />
    </IconButton>
  ) : null;

  return (
    <>
      <DialogShell
        open={open}
        onClose={onClose}
        isMobile={isMobile}
        maxWidth="md"
        TransitionComponent={isMobile ? Transition : undefined}
        headerLeading={mobileNavButton}
        headerIcon={(
          <Box
            component="img"
            src={currentDbConfig.icon}
            alt="Database logo"
            sx={{ width: 28, height: 28, objectFit: 'contain' }}
          />
        )}
        headerTitle={isMobile ? mobileHeaderTitle : 'Connect Database'}
        bodySx={{ flexDirection: 'row' }}
        footer={(
          <>
            {isConnected ? (
              <Button
                onClick={handleDisconnect}
                color="error"
                startIcon={<PowerSettingsNewRoundedIcon />}
                disabled={loading}
                size="small"
                sx={{ minHeight: { xs: UI_LAYOUT.compactTouchTarget, sm: 'auto' } }}
              >
                Disconnect
              </Button>
            ) : <Box />}
            <Button
              onClick={handleConnect}
              disabled={loading || isConnected}
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
              size="small"
              sx={{ minHeight: { xs: UI_LAYOUT.compactTouchTarget, sm: 'auto' } }}
            >
              {loading ? 'Connecting...' : 'Connect'}
            </Button>
          </>
        )}
      >
        {!isMobile ? (
          <Box sx={getDialogNavPaneSx(theme, 180)}>
            {navContent}
          </Box>
        ) : null}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, overflow: 'hidden' }}>
          {isMobile ? (
            <>
              {hasDatabases ? (
                <Box sx={{ px: 2, pt: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <ToggleButtonGroup
                    value={mobileSection}
                    exclusive
                    onChange={(event, value) => value && setMobileSection(value)}
                    fullWidth
                    size="small"
                    sx={{
                      '& .MuiToggleButton-root': {
                        gap: 1,
                        py: 1,
                        minHeight: UI_LAYOUT.compactTouchTarget,
                      },
                    }}
                  >
                    <ToggleButton value="connect">
                      <LinkRoundedIcon sx={{ fontSize: 18 }} />
                      <Typography variant="body2" fontWeight={500}>Connection</Typography>
                    </ToggleButton>
                    <ToggleButton value="databases">
                      <StorageRoundedIcon sx={{ fontSize: 18 }} />
                      <Typography variant="body2" fontWeight={500}>Databases</Typography>
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              ) : null}
              <Fade in key={mobileSection}>
                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                  {mobileSection === 'databases' && hasDatabases ? (
                    renderDatabaseSection({ p: 2, backgroundColor: 'transparent' })
                  ) : (
                    <Box sx={{ height: '100%', p: 2, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      {renderConnectionForm()}
                    </Box>
                  )}
                </Box>
              </Fade>
            </>
          ) : (
            <>
              <Fade in key="form">
                <Box sx={{ flex: 1, p: { xs: 2, sm: 3 }, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  {renderConnectionForm()}
                </Box>
              </Fade>
              {hasDatabases ? (
                <>
                  <Divider orientation="vertical" flexItem />
                  <Fade in key="databases">
                    {renderDatabaseSection()}
                  </Fade>
                </>
              ) : null}
            </>
          )}
        </Box>
      </DialogShell>
      {isMobile ? (
        <Drawer
          anchor="left"
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ zIndex: (muiTheme) => muiTheme.zIndex.modal + 2 }}
          PaperProps={{
            sx: {
              width: 220,
              maxWidth: '85vw',
              height: '100vh',
              [DIALOG_VIEWPORT_SUPPORT_QUERY]: {
                height: '100dvh',
              },
              paddingBottom: 'env(safe-area-inset-bottom)',
              overflowY: 'auto',
              backgroundColor: theme.palette.background.paper,
            },
          }}
        >
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Database Type
            </Typography>
          </Box>
          {navContent}
        </Drawer>
      ) : null}
    </>
  );
}

export default memo(DatabaseModal);
