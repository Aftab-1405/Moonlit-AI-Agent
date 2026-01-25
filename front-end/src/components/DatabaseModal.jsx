import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  useMediaQuery,
  Slide,
  Stack,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Paper,
  Badge,
  Fade,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useSettings } from '../contexts/SettingsContext';
import { useLocalStorage } from '../hooks';

// Icons
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import PowerSettingsNewRoundedIcon from '@mui/icons-material/PowerSettingsNewRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import DnsRoundedIcon from '@mui/icons-material/DnsRounded';
import SettingsInputComponentRoundedIcon from '@mui/icons-material/SettingsInputComponentRounded';
import TableViewRoundedIcon from '@mui/icons-material/TableViewRounded';

// API & Validation
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

// --- Constants & Config ---

const DB_TYPES = [
  { value: 'mysql', label: 'MySQL', defaultPort: 3306, supportsConnectionString: true, icon: '/logo-mysql.svg' },
  { value: 'postgresql', label: 'PostgreSQL', defaultPort: 5432, supportsConnectionString: true, icon: '/logo-postgresql.svg' },
  { value: 'sqlserver', label: 'SQL Server', defaultPort: 1433, supportsConnectionString: true, icon: '/logo-microsoft-sql-server.svg' },
  { value: 'oracle', label: 'Oracle', defaultPort: 1521, supportsConnectionString: true, icon: '/logo-oracle.svg' },
  { value: 'sqlite', label: 'SQLite', defaultPort: null, supportsConnectionString: false, icon: '/logo-sqlite.svg' },
];

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// --- Sub-Components ---

const VisibilityToggleAdornment = memo(({ show, onToggle }) => (
  <InputAdornment position="end">
    <IconButton size="small" onClick={onToggle} edge="end">
      {show ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
    </IconButton>
  </InputAdornment>
));

const DbTypeSelector = memo(({ value, onChange }) => {
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', px: 2, pt: 1 }}>
      <Tabs
        value={value}
        onChange={onChange}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          minHeight: 56,
          '& .MuiTab-root': { minHeight: 56, minWidth: 'auto', px: 2 },
        }}
      >
        {DB_TYPES.map((type) => (
          <Tab
            key={type.value}
            value={type.value}
            label={
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box
                  component="img"
                  src={type.icon}
                  alt={type.label}
                  sx={{ width: 20, height: 20, objectFit: 'contain' }}
                />
                <Typography variant="body2" fontWeight={500}>{type.label}</Typography>
              </Stack>
            }
          />
        ))}
      </Tabs>
    </Box>
  );
});

const DatabaseList = memo(({ databases, currentDatabase, onSelect, loading, isMobile }) => {
  // Empty State
  if (databases.length === 0) {
    return (
      <Box sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        p: 4,
        opacity: 0.6
      }}>
        <StorageRoundedIcon sx={{ fontSize: 48, mb: 2, color: 'text.disabled' }} />
        <Typography variant="body2" color="text.secondary" align="center">
          No databases found.<br />Connect to a server first.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {!isMobile && (
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, px: 1, fontWeight: 600 }}>
          Available Databases
        </Typography>
      )}
      <Paper
        variant="outlined"
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          bgcolor: 'background.paper',
          border: isMobile ? 'none' : '1px solid',
          borderColor: 'divider',
          ...(isMobile && { bgcolor: 'transparent' }) // Transparent on mobile to blend with container
        }}
      >
        <List sx={{ width: '100%', overflow: 'auto', p: 0 }}>
          {databases.map((db) => {
            const isSelected = db === currentDatabase;
            return (
              <ListItem key={db} disablePadding divider>
                <ListItemButton
                  onClick={() => onSelect(db)}
                  selected={isSelected}
                  disabled={loading}
                  sx={{ py: 1.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {isSelected ? <CheckRoundedIcon color="primary" fontSize="small" /> : <StorageRoundedIcon color="action" fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText
                    primary={db}
                    primaryTypographyProps={{
                      variant: 'body2',
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? 'primary.main' : 'text.primary'
                    }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Paper>
    </Box>
  );
});

// --- Main Component ---

function DatabaseModal({ open, onClose, onConnect, isConnected, currentDatabase }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { settings } = useSettings();

  // Settings
  const defaultDbType = settings.defaultDbType || 'postgresql';
  const rememberConnection = settings.rememberConnection ?? false;

  // State
  const [savedConnection, setSavedConnection] = useLocalStorage('moonlit-saved-connection', null);
  const [dbType, setDbType] = useState(defaultDbType);
  const [connectionMode, setConnectionMode] = useState('credentials');
  const [connectionString, setConnectionString] = useState('');

  // Mobile Tab State: 0 = Form, 1 = Databases
  const [mobileTab, setMobileTab] = useState(0);

  const [formData, setFormData] = useState({
    host: 'localhost',
    port: '5432',
    user: '',
    password: '',
    database: '',
  });

  // UI State
  const [showPassword, setShowPassword] = useState(false);
  const [showConnectionString, setShowConnectionString] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [databases, setDatabases] = useState([]);
  const [isRemote, setIsRemote] = useState(false);

  // Validation
  const { errors: fieldErrors, validateForm, clearError } = useFormValidation(dbFieldSchemas);

  const timeoutRefs = useRef([]);
  const currentDbConfig = useMemo(() => DB_TYPES.find(d => d.value === dbType) || DB_TYPES[1], [dbType]);
  const isSQLite = dbType === 'sqlite';
  const supportsConnectionString = currentDbConfig.supportsConnectionString;

  // --- Effects ---

  useEffect(() => () => timeoutRefs.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (rememberConnection && open && savedConnection) {
      if (savedConnection.dbType) setDbType(savedConnection.dbType);
      if (savedConnection.connectionMode) setConnectionMode(savedConnection.connectionMode);
      if (savedConnection.formData) {
        setFormData(prev => ({ ...prev, ...savedConnection.formData }));
      }
    }
  }, [open, rememberConnection, savedConnection]);

  // Reset tab when modal opens
  useEffect(() => {
    if (open) {
      // If connected and has DBs, show DB tab, otherwise show form
      if (isConnected && databases.length > 0) {
        setMobileTab(1);
      } else {
        setMobileTab(0);
      }
    }
  }, [open, isConnected, databases.length]);

  const fetchDatabases = useCallback(async () => {
    try {
      const data = await getDatabases();
      if (data.status === 'success' && data.databases) {
        setDatabases(data.databases);
        if (data.is_remote) {
          setIsRemote(true);
          setDbType('postgresql');
          setConnectionMode('connection_string');
        }
        // If we just fetched DBs successfully, switch to DB tab on mobile
        if (isMobile) setMobileTab(1);
      }
    } catch (err) {
      console.error('Failed to fetch databases:', err);
    }
  }, [isMobile]);

  useEffect(() => {
    if (open && isConnected && databases.length === 0) {
      fetchDatabases();
    }
  }, [open, isConnected, databases.length, fetchDatabases]);


  // --- Handlers ---

  const safeSetTimeout = useCallback((cb, delay) => {
    const id = setTimeout(cb, delay);
    timeoutRefs.current.push(id);
    return id;
  }, []);

  const handleDbTypeChange = useCallback((_, newValue) => {
    setDbType(newValue);
    const dbConfig = DB_TYPES.find((d) => d.value === newValue);
    setFormData((prev) => ({
      ...prev,
      port: dbConfig?.defaultPort?.toString() || '',
    }));
    setError(null);
  }, []);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
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
              database: formData.database
            }
          });
        }

        // Auto-switch to Database tab on mobile upon connection
        if (isMobile) {
          setMobileTab(1);
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
  }, [isSQLite, dbType, formData, connectionMode, supportsConnectionString, connectionString, validateForm, onConnect, rememberConnection, setSavedConnection, safeSetTimeout, onClose, isMobile]);

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
  }, [isRemote, onConnect, safeSetTimeout, onClose]);

  const handleDisconnect = useCallback(async () => {
    setLoading(true);
    try {
      await disconnectDb();
      setDatabases([]);
      setSuccess(null);
      onConnect?.(null);
      // Switch back to form tab on disconnect
      if (isMobile) setMobileTab(0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [onConnect, isMobile]);

  const handleMobileTabChange = useCallback((event, newValue) => {
    setMobileTab(newValue);
  }, []);

  // --- Render Helpers ---

  const renderConnectionForm = () => (
    <Stack spacing={2.5}>
      {!isSQLite && supportsConnectionString && (
        <ToggleButtonGroup
          value={connectionMode}
          exclusive
          onChange={(e, val) => val && setConnectionMode(val)}
          fullWidth
          size="small"
          sx={{
            bgcolor: 'background.default',
            '& .MuiToggleButton-root': { py: 0.75, width: '50%' }
          }}
        >
          <ToggleButton value="credentials">
            <Stack direction="row" alignItems="center" spacing={1}>
              <HomeRoundedIcon sx={{ fontSize: 18 }} />
              <Typography variant="body2" fontWeight={500}>Local</Typography>
            </Stack>
          </ToggleButton>
          <ToggleButton value="connection_string">
            <Stack direction="row" alignItems="center" spacing={1}>
              <LinkRoundedIcon sx={{ fontSize: 18 }} />
              <Typography variant="body2" fontWeight={500}>Remote</Typography>
            </Stack>
          </ToggleButton>
        </ToggleButtonGroup>
      )}

      {isSQLite ? (
        <TextField
          fullWidth
          name="database"
          label="Database Path"
          placeholder="e.g., C:\\data\\mydb.sqlite or /home/user/data/mydb.db"
          value={formData.database}
          onChange={handleInputChange}
          error={!!fieldErrors.database}
          helperText={fieldErrors.database || "Enter the full absolute path to your SQLite database file"}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title="Paste path from clipboard">
                  <IconButton
                    size="small"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                          setFormData(prev => ({ ...prev, database: text.trim() }));
                        }
                      } catch (err) {
                        console.warn('Clipboard access denied:', err);
                      }
                    }}
                    sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                  >
                    <FolderOpenOutlinedIcon />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            )
          }}
        />
      ) : connectionMode === 'connection_string' && supportsConnectionString ? (
        <TextField
          fullWidth
          label="Connection String"
          value={connectionString}
          onChange={(e) => { setConnectionString(e.target.value); clearError('connectionString'); }}
          type={showConnectionString ? 'text' : 'password'}
          error={!!fieldErrors.connectionString}
          helperText={fieldErrors.connectionString || "e.g., postgresql://user:pass@host:5432/db"}
          InputProps={{
            endAdornment: <VisibilityToggleAdornment show={showConnectionString} onToggle={() => setShowConnectionString(!showConnectionString)} />
          }}
        />
      ) : (
        <>
          <Stack direction="row" spacing={2}>
            <TextField
              fullWidth
              name="host"
              label="Host"
              placeholder="localhost"
              value={formData.host}
              onChange={handleInputChange}
              error={!!fieldErrors.host}
              helperText={fieldErrors.host}
            />
            <TextField
              sx={{ width: 100, flexShrink: 0 }}
              name="port"
              label="Port"
              value={formData.port}
              onChange={handleInputChange}
              error={!!fieldErrors.port}
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
          />
          <TextField
            fullWidth
            name="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={handleInputChange}
            error={!!fieldErrors.password}
            InputProps={{
              endAdornment: <VisibilityToggleAdornment show={showPassword} onToggle={() => setShowPassword(!showPassword)} />
            }}
          />
          <TextField
            fullWidth
            name="database"
            label="Database (Optional)"
            value={formData.database}
            onChange={handleInputChange}
            autoCapitalize="none"
          />
        </>
      )}
    </Stack>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
      TransitionComponent={isMobile ? Transition : undefined}
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          height: isMobile ? '100%' : 600,
          maxHeight: isMobile ? '100%' : 600,
          ...(isMobile && { borderRadius: 0 })
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            component="img"
            src={currentDbConfig.icon}
            alt="db-logo"
            sx={{
              width: 32,
              height: 32,
              objectFit: 'contain'
            }}
          />
          <Typography variant="h6" fontWeight={600}>Connect Database</Typography>
        </Stack>
        <IconButton onClick={onClose} edge="end">
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      {/* MOBILE ONLY: View Switcher Tabs */}
      {isMobile && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={mobileTab}
            onChange={handleMobileTabChange}
            variant="fullWidth"
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab icon={<SettingsInputComponentRoundedIcon fontSize="small" />} iconPosition="start" label="Credentials" />
            <Tab
              icon={
                <Badge badgeContent={databases.length} color="primary" variant="dot" invisible={databases.length === 0}>
                  <TableViewRoundedIcon fontSize="small" />
                </Badge>
              }
              iconPosition="start"
              label="Databases"
              disabled={databases.length === 0 && !isConnected}
            />
          </Tabs>
        </Box>
      )}

      <DialogContent
        sx={{
          p: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%', // Take full height of Paper
          overflow: 'hidden'
        }}
      >

        {/* Only show DB Type Selector if we are on Credentials Tab (Mobile) OR Desktop */}
        {(!isMobile || mobileTab === 0) && (
          <DbTypeSelector value={dbType} onChange={handleDbTypeChange} />
        )}

        <Box
          sx={{
            flex: 1,
            display: isMobile ? 'block' : 'flex',
            flexDirection: 'row',
            overflow: isMobile ? 'visible' : 'hidden'
          }}
        >

          {/* Left: Form Area */}
          {/* Show on Desktop OR if Mobile Tab is 0 */}
          {(!isMobile || mobileTab === 0) && (
            <Fade in={true}>
              <Box sx={{
                flex: isMobile ? 'none' : 1,
                p: { xs: 2.5, sm: 3.5 },
                overflowY: isMobile ? 'visible' : 'auto',
                bgcolor: 'background.paper',
                // On mobile, take full height
                minHeight: isMobile ? 'calc(100vh - 200px)' : 'auto'
              }}>
                {renderConnectionForm()}

                {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mt: 3 }}>{success}</Alert>}
              </Box>
            </Fade>
          )}

          {/* Right: Database List Area */}
          {/* Show on Desktop OR if Mobile Tab is 1 */}
          {(!isMobile || mobileTab === 1) && (
            <Fade in={true}>
              <Box sx={{
                flex: isMobile ? 1 : { sm: 1 },
                p: { xs: 2.5, sm: 3 },
                overflowY: isMobile ? 'visible' : 'hidden',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'background.default',
                borderLeft: { sm: 1 },
                borderColor: 'divider',
                // On mobile, take full height
                minHeight: isMobile ? 'calc(100vh - 200px)' : 'auto'
              }}>
                <DatabaseList
                  databases={databases}
                  currentDatabase={currentDatabase}
                  onSelect={handleSelectDatabase}
                  loading={loading}
                  isMobile={isMobile}
                />
              </Box>
            </Fade>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{
        px: 3,
        py: 2,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        gap: 1
      }}>
        {isConnected && (
          <Button
            onClick={handleDisconnect}
            color="error"
            startIcon={<PowerSettingsNewRoundedIcon />}
            disabled={loading}
            sx={{ mr: 'auto' }}
          >
            {isMobile ? "Disconnect" : "Disconnect DB"}
          </Button>
        )}

        {/* Primary Action Button */}
        {/* On Mobile Tab 0 (Credentials) -> Show "Connect" */}
        {/* On Mobile Tab 1 (Databases) -> Hide Connect (User clicks list items) */}
        {!isConnected && (!isMobile || mobileTab === 0) && (
          <Button

            onClick={handleConnect}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
            sx={{ minWidth: 120 }}
          >
            {loading ? 'Connecting...' : 'Connect'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default memo(DatabaseModal);
