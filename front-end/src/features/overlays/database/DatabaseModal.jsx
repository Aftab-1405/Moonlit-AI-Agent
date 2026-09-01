import {
  Alert,
  Box,
  Button,
  Fade,
  IconButton,
  InputAdornment,
  Slide,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectDb, disconnectDb, getDatabases } from '@/api';
import { queryClient, queryKeys } from '@/api/queryClient';
import { ButtonLoadingSpinner, DialogShell } from '@/components';
import {
  CredentialIcon,
  DatabaseIcon,
  LinkIcon,
  SuccessIcon,
  VisibilityOffIcon,
  VisibilityOnIcon,
} from '@/components/icons';
import { DB_TYPES } from '@/config/databases';
import { useSettings } from '@/contexts/SettingsContext';
import {
  getPreferenceBackdropSx,
  getPreferenceBodySx,
  getPreferenceButtonSx,
  getPreferencePaperSx,
  getPreferenceRootSx,
  getPreferenceToggleGroupSx,
  PreferenceFooterActions,
  PreferenceLayout,
  PreferenceNavItem,
  PreferenceNavList,
  PreferencePageHeader,
  PreferenceRow,
  PreferenceSection,
} from '@/features/overlays/preference-surface';
import { useLocalStorage } from '@/hooks';
import { useFormValidation } from '@/hooks/useFormValidation';
import { UI_LAYOUT } from '@/styles/shared';
import { getSelectedDatabase } from '@/utils/databaseResponse';
import logger from '@/utils/logger';
import {
  connectionStringSchema,
  credentialsSchema,
  dbFieldSchemas,
} from '@/utils/validationSchemas';
import { getConnectedActionDisabledSx, getConnectionActionState } from './databaseModalState';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

function DatabaseSection({ title, children, sx = {} }) {
  return (
    <PreferenceSection title={title} sx={sx}>
      {children}
    </PreferenceSection>
  );
}

function FieldGrid({ children }) {
  return (
    <Box
      component="form"
      noValidate
      autoComplete="off"
      sx={{
        mt: 0.5,
        mb: 0,
      }}
    >
      {children}
    </Box>
  );
}

const VisibilityToggleAdornment = memo(({ show, onToggle }) => (
  <InputAdornment position="end" sx={{ mr: 0, alignSelf: 'center' }}>
    <Tooltip title={show ? 'Hide password' : 'Show password'}>
      <IconButton
        size="small"
        onClick={onToggle}
        edge="end"
        aria-label={show ? 'Hide password' : 'Show password'}
        disableRipple
        sx={{
          width: 32,
          height: 32,
          mr: -0.5,
          color: 'text.secondary',
          backgroundColor: 'transparent',
          border: 'none',
          boxShadow: 'none',
          '&:hover': {
            color: 'text.primary',
            backgroundColor: 'transparent',
            border: 'none',
            boxShadow: 'none',
          },
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: (theme) => theme.palette.border.focus,
            outlineOffset: 2,
          },
        }}
      >
        {show ? <VisibilityOffIcon fontSize="small" /> : <VisibilityOnIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  </InputAdornment>
));

function EmptyState({ icon, title, subtitle }) {
  const Icon = icon;
  const theme = useTheme();
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 3 }}>
      <Icon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
      <Typography sx={{ ...theme.typography.uiBodySm, color: 'text.secondary', fontWeight: 400 }}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography
          sx={{
            ...theme.typography.uiCaptionMd,
            color: 'text.disabled',
            mt: 0.5,
            display: 'block',
          }}
        >
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * Extract the list of databases to show in the "Available Databases" section.
 *
 * IMPORTANT: This must NOT fall back to `connectionData.schemas`. See the
 * detailed comment in `DatabaseContext.getDatabaseList` for the full
 * rationale — the short version is that the PostgreSQL connect handler
 * historically returned the database list under the `schemas` key, and the
 * frontend's fallback masked it by displaying PostgreSQL schemas as if they
 * were databases.
 */
function getDatabaseOptions(connectionData = {}) {
  if (connectionData.databases?.length) return connectionData.databases;

  // No databases list — fall back to the single connected database.
  // Never fall back to `schemas`.
  const selectedDatabase = getSelectedDatabase(connectionData);
  return selectedDatabase ? [selectedDatabase] : [];
}

const DatabaseList = memo(({ databases, currentDatabase, onSelect, loading }) => {
  const theme = useTheme();

  if (databases.length === 0) {
    return (
      <EmptyState
        icon={DatabaseIcon}
        title="No databases found"
        subtitle="Connect to a server first"
      />
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
      }}
    >
      {databases.map((db, index) => {
        const isSelected = db === currentDatabase;
        return (
          <Box
            key={db}
            role="button"
            tabIndex={loading ? -1 : 0}
            onClick={() => !loading && onSelect(db)}
            onKeyDown={(e) => {
              if (!loading && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(db);
              }
            }}
            aria-pressed={isSelected}
            sx={{
              px: { xs: 0.5, sm: 0.75 },
              py: { xs: 1.25, sm: 1.125 },
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'background-color 120ms ease',
              minHeight: { xs: UI_LAYOUT.touchTarget, sm: 40 },
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              minWidth: 0,
              backgroundColor: isSelected
                ? theme.palette.action.selected
                : index % 2 === 0
                  ? theme.palette.layer.barely
                  : 'transparent',
              '&:hover': !loading
                ? {
                    backgroundColor: isSelected
                      ? theme.palette.layer.medium
                      : theme.palette.action.hover,
                  }
                : undefined,
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.border.focus}`,
                outlineOffset: 1,
              },
            }}
          >
            {isSelected ? (
              <SuccessIcon sx={{ fontSize: 18, color: 'text.primary', flexShrink: 0 }} />
            ) : (
              <DatabaseIcon sx={{ width: 16, height: 16, opacity: 0.78 }} />
            )}
            <Typography
              sx={{
                ...theme.typography.uiBodySm,
                fontWeight: 400,
                color: isSelected ? 'text.primary' : 'text.secondary',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {db}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
});

function DatabaseModal({
  open,
  onClose,
  onConnect,
  onSelectDatabase,
  isConnected,
  currentDatabase,
  availableDatabases = [],
  initialDbType = null,
}) {
  const headingRef = useRef(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { settings } = useSettings();
  const defaultDbType = settings.defaultDbType || 'postgresql';
  const rememberConnection = settings.rememberConnection ?? false;
  const [savedConnection, setSavedConnection] = useLocalStorage('moonlit-saved-connection', null);
  const [dbType, setDbType] = useState(defaultDbType);
  const [connectionMode, setConnectionMode] = useState('credentials');
  const [connectionString, setConnectionString] = useState('');
  const [mobileSection, setMobileSection] = useState('connect');
  const [formData, setFormData] = useState({
    host: '',
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
  const _sharedDatabasesKey = useMemo(
    () => availableDatabases.join('\u001f'),
    [availableDatabases],
  );

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);
  const [_isRemote, setIsRemote] = useState(false);
  const [connectionActive, setConnectionActive] = useState(isConnected);
  const [selectedDatabase, setSelectedDatabase] = useState(currentDatabase);
  const {
    errors: fieldErrors,
    validateField,
    validateForm,
    clearError,
  } = useFormValidation(dbFieldSchemas);
  const currentDbConfig = useMemo(
    () => DB_TYPES.find((db) => db.value === dbType) || DB_TYPES[1],
    [dbType],
  );
  const supportsConnectionString = currentDbConfig.supportsConnectionString;
  const hasDatabases = databases.length > 0;
  const databaseSurfaceLeft = '0px';
  const databaseSurfaceWidth = '100vw';
  const mainContentDialogRootSx = useMemo(() => getPreferenceRootSx(), []);

  useEffect(() => {
    if (open) {
      setConnectionActive(isConnected);
      setSelectedDatabase(currentDatabase);
      if (availableDatabases.length > 0) {
        setDatabases(availableDatabases);
      }
    }
  }, [availableDatabases, currentDatabase, isConnected, open]);

  useEffect(() => {
    if (open) {
      const targetDbType = initialDbType || settings.defaultDbType || 'postgresql';
      setDbType(targetDbType);
    }
  }, [open, initialDbType, settings.defaultDbType]);

  // Watch for dbType changes to restore saved connections or set default ports
  useEffect(() => {
    if (open && dbType) {
      if (rememberConnection && savedConnection && savedConnection.dbType === dbType) {
        if (savedConnection.connectionMode) setConnectionMode(savedConnection.connectionMode);
        if (savedConnection.formData) {
          setFormData((prev) => ({ ...prev, ...savedConnection.formData }));
        }
      } else {
        // Not a saved connection tab, completely clear previous form data
        // to prevent bleeding credentials from one provider to another.
        const dbConfig = DB_TYPES.find((db) => db.value === dbType);
        setFormData({
          host: '',
          user: '',
          password: '',
          database: '',
          port: dbConfig?.defaultPort?.toString() || '',
        });
        setConnectionString(''); // Clear connection string as well
      }
    }
  }, [open, dbType, rememberConnection, savedConnection]);

  useEffect(() => {
    if (open && initialDbType) {
      const isValid = DB_TYPES.some((db) => db.value === initialDbType);
      if (isValid) {
        setDbType(initialDbType);
        // Also update the port to match the new db type
        const dbConfig = DB_TYPES.find((db) => db.value === initialDbType);
        if (dbConfig?.defaultPort) {
          setFormData((prev) => ({ ...prev, port: dbConfig.defaultPort.toString() }));
        }
      }
    }
  }, [open, initialDbType]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const fetchDatabases = useCallback(async () => {
    try {
      const response = await queryClient.fetchQuery({
        queryKey: queryKeys.dbDatabases,
        queryFn: getDatabases,
        staleTime: 5 * 60 * 1000,
      });
      if (response.status === 'success' && response.data?.databases) {
        setDatabases(response.data.databases);
        if (response.data?.is_remote) {
          setIsRemote(true);
          if (response.data?.db_type) {
            setDbType(response.data.db_type);
          }
          setConnectionMode('connection_string');
        }
      }
    } catch (err) {
      logger.error('Failed to fetch databases:', err);
    }
  }, []);

  useEffect(() => {
    if (open && availableDatabases.length > 0) {
      setDatabases(availableDatabases);
      return;
    }

    if (open && connectionActive && databases.length === 0) {
      fetchDatabases();
    }
  }, [availableDatabases, connectionActive, databases.length, fetchDatabases, open]);

  useEffect(() => {
    if (!hasDatabases && mobileSection === 'databases') {
      setMobileSection('connect');
    }
  }, [hasDatabases, mobileSection]);

  const handleDbTypeChange = useCallback((newValue) => {
    setDbType(newValue);
    setError(null);
  }, []);

  const handleInputChange = useCallback(
    (event) => {
      const { name, value } = event.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
      clearError(name);
      setError(null);
    },
    [clearError],
  );

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let payload;
      let isValid = false;

      if (connectionMode === 'connection_string' && supportsConnectionString) {
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

      const response = await connectDb(payload);

      if (response.status === 'success') {
        const connectionData = response.data;
        setSuccess(response.message || 'Database connected successfully');
        setDatabases(getDatabaseOptions(connectionData));
        setIsRemote(connectionData.is_remote || false);
        setConnectionActive(true);
        // Use centralized helper to resolve the connected database name.
        setSelectedDatabase(getSelectedDatabase(connectionData) || formData.database || null);
        onConnect?.(connectionData);

        // Auto-route the user to the Databases tab now that the connection is
        // established. The Connection tab's job (credentials/URI setup) is
        // done — the user should be looking at the database picker next.
        const connectedDatabases = getDatabaseOptions(connectionData);
        if (connectedDatabases.length > 0) {
          setMobileSection('databases');
        }

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
      } else {
        setError(response.message || 'Failed to connect');
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
    onConnect,
    rememberConnection,
    setSavedConnection,
    supportsConnectionString,
    validateForm,
  ]);

  const handleSelectDatabase = useCallback(
    async (dbName) => {
      setLoading(true);
      setError(null);
      try {
        const response = await onSelectDatabase?.(dbName);
        if (response?.success) {
          setSuccess(`Switched to ${dbName}`);
          setSelectedDatabase(dbName);
        } else {
          setError(response?.error || 'Failed to select database');
        }
      } catch (err) {
        setError(err.message || 'Failed to select database');
      } finally {
        setLoading(false);
      }
    },
    [onSelectDatabase],
  );

  const handleDisconnect = useCallback(async () => {
    setLoading(true);
    try {
      await disconnectDb();
      setDatabases([]);
      setSuccess(null);
      setConnectionActive(false);
      setSelectedDatabase(null);
      // Reset back to the Connection tab so the user is back at the
      // credential-setup stage for the next connection.
      setMobileSection('connect');
      onConnect?.(null);
    } catch (err) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  }, [onConnect]);

  const toggleGroupSx = useMemo(() => getPreferenceToggleGroupSx(theme), [theme]);
  const dangerButtonSx = useMemo(() => getPreferenceButtonSx(theme, { tone: 'danger' }), [theme]);
  const connectionActionState = getConnectionActionState({ loading, connected: connectionActive });
  const connectionButtonSx = useMemo(() => {
    const sx = getPreferenceButtonSx(theme, { tone: connectionActionState.tone });
    if (connectionActionState.tone !== 'success') return sx;

    return {
      ...sx,
      ...getConnectedActionDisabledSx(theme),
    };
  }, [connectionActionState.tone, theme]);

  const navContent = (
    <PreferenceNavList ariaLabel="Database type">
      {DB_TYPES.map((type) => (
        <PreferenceNavItem
          key={type.value}
          active={dbType === type.value}
          onClick={() => handleDbTypeChange(type.value)}
        >
          {type.label}
        </PreferenceNavItem>
      ))}
    </PreferenceNavList>
  );

  const renderConnectionForm = () => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {supportsConnectionString ? (
        <DatabaseSection title="Connection Method">
          <PreferenceRow
            label="Connection mode"
            description="Choose credentials or a full connection URI"
            sx={{ backgroundColor: 'transparent' }}
          >
            <ToggleButtonGroup
              value={connectionMode}
              exclusive
              onChange={(_event, value) => value && setConnectionMode(value)}
              size="small"
              sx={toggleGroupSx}
            >
              <ToggleButton value="credentials">
                <CredentialIcon sx={{ fontSize: 16 }} />
                Credentials
              </ToggleButton>
              <ToggleButton value="connection_string">
                <LinkIcon sx={{ fontSize: 16 }} />
                Connection String
              </ToggleButton>
            </ToggleButtonGroup>
          </PreferenceRow>
        </DatabaseSection>
      ) : null}
      <DatabaseSection title="Connection Details">
        <FieldGrid>
          {connectionMode === 'connection_string' && supportsConnectionString ? (
            <TextField
              fullWidth
              label="Connection String"
              value={connectionString}
              onChange={(event) => {
                setConnectionString(event.target.value);
                clearError('connectionString');
              }}
              onBlur={(e) => validateField('connectionString', e.target.value)}
              type={showConnectionString ? 'text' : 'password'}
              error={!!fieldErrors.connectionString}
              helperText={
                fieldErrors.connectionString || 'e.g., postgresql://user:pass@host:5432/db'
              }
              variant="standard"
              InputProps={{
                endAdornment: (
                  <VisibilityToggleAdornment
                    show={showConnectionString}
                    onToggle={() => setShowConnectionString(!showConnectionString)}
                  />
                ),
              }}
            />
          ) : (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  name="host"
                  label="Host"
                  placeholder="e.g., db.example.com"
                  value={formData.host}
                  onChange={handleInputChange}
                  onBlur={(e) => validateField('host', e.target.value)}
                  error={!!fieldErrors.host}
                  helperText={fieldErrors.host}
                  variant="standard"
                />
                <TextField
                  sx={{ width: { xs: '100%', sm: 100 }, flexShrink: 0 }}
                  name="port"
                  label="Port"
                  value={formData.port}
                  onChange={handleInputChange}
                  onBlur={(e) => validateField('port', e.target.value)}
                  error={!!fieldErrors.port}
                  helperText={fieldErrors.port}
                  variant="standard"
                />
              </Stack>
              <TextField
                fullWidth
                name="user"
                label="Username"
                autoCapitalize="none"
                value={formData.user}
                onChange={handleInputChange}
                onBlur={(e) => validateField('user', e.target.value)}
                error={!!fieldErrors.user}
                helperText={fieldErrors.user}
                variant="standard"
              />
              <TextField
                fullWidth
                name="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleInputChange}
                onBlur={(e) => validateField('password', e.target.value)}
                error={!!fieldErrors.password}
                helperText={fieldErrors.password}
                variant="standard"
                InputProps={{
                  endAdornment: (
                    <VisibilityToggleAdornment
                      show={showPassword}
                      onToggle={() => setShowPassword(!showPassword)}
                    />
                  ),
                }}
              />
              <TextField
                fullWidth
                name="database"
                label="Database (Optional)"
                value={formData.database}
                onChange={handleInputChange}
                onBlur={(e) => validateField('database', e.target.value)}
                error={!!fieldErrors.database}
                helperText={fieldErrors.database}
                autoCapitalize="none"
                variant="standard"
              />
            </Stack>
          )}
        </FieldGrid>
      </DatabaseSection>
      {error ? (
        <Alert severity="error" sx={{ borderRadius: '8px', mt: 1 }}>
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert severity="success" sx={{ borderRadius: '8px', mt: 1 }}>
          {success}
        </Alert>
      ) : null}
    </Box>
  );

  const renderDatabaseSection = (sx = {}) => (
    <Box sx={{ ...sx }}>
      <DatabaseSection title="Available Databases" sx={{ mb: 0 }}>
        <DatabaseList
          databases={databases}
          currentDatabase={selectedDatabase}
          onSelect={handleSelectDatabase}
          loading={loading}
        />
      </DatabaseSection>
    </Box>
  );

  // The tab toggle only appears when a connection is active AND databases are
  // available. Before a connection is established, the user stays on the
  // Connection tab exclusively — keeping credential setup and database
  // selection strictly separated.
  const showTabs = connectionActive && hasDatabases;

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      isMobile={isMobile}
      maxWidth={false}
      fullWidth={false}
      TransitionComponent={isMobile ? Transition : undefined}
      desktopMaxHeight="100vh"
      desktopMinHeight="100vh"
      showCloseButton={false}
      disableAutoFocus
      disableEnforceFocus
      keepMounted
      transitionDuration={180}
      rootSx={mainContentDialogRootSx}
      paperSx={getPreferencePaperSx(theme, databaseSurfaceLeft, databaseSurfaceWidth)}
      backdropSx={getPreferenceBackdropSx(databaseSurfaceLeft, databaseSurfaceWidth)}
      bodySx={getPreferenceBodySx(theme)}
    >
      <PreferencePageHeader title="Connect Database" onClose={onClose} headingRef={headingRef} />

      <PreferenceLayout sidebar={navContent}>
        {showTabs ? (
          <Box sx={{ mb: 4 }}>
            <ToggleButtonGroup
              value={mobileSection}
              exclusive
              onChange={(_event, value) => value && setMobileSection(value)}
              size="small"
              sx={toggleGroupSx}
            >
              <ToggleButton value="connect">
                <LinkIcon sx={{ fontSize: 16 }} />
                Connection
              </ToggleButton>
              <ToggleButton value="databases">
                <DatabaseIcon sx={{ width: 16, height: 16 }} />
                Databases
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        ) : null}

        <Fade in key={mobileSection}>
          <Box>
            {mobileSection === 'databases' && showTabs
              ? renderDatabaseSection()
              : // Connection tab is rendered in two scenarios:
                //   1. No connection yet — user is setting up credentials.
                //   2. Connection is active AND databases are available — user
                //      has explicitly switched back to the Connection tab.
                // In scenario 2 we do NOT render the database list below the
                // form (the user has a dedicated Databases tab for that).
                renderConnectionForm()}
          </Box>
        </Fade>

        <PreferenceFooterActions>
          {connectionActive ? (
            <Button
              variant="outlined"
              color="error"
              onClick={handleDisconnect}
              disabled={loading}
              size="small"
              sx={dangerButtonSx}
            >
              Disconnect
            </Button>
          ) : (
            <Box />
          )}
          <Button
            variant="outlined"
            color={connectionActionState.tone}
            disableElevation
            onClick={handleConnect}
            disabled={connectionActionState.disabled}
            startIcon={loading ? <ButtonLoadingSpinner /> : null}
            size="small"
            sx={connectionButtonSx}
          >
            {connectionActionState.label}
          </Button>
        </PreferenceFooterActions>
      </PreferenceLayout>
    </DialogShell>
  );
}

export default memo(DatabaseModal);
