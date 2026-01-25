import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  IconButton,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Switch,
  Select,
  MenuItem,
  FormControl,
  Tabs,
  Tab,
  Chip,
} from '@mui/material';
import { alpha, useTheme as useMuiTheme } from '@mui/material/styles';
import { useMediaQuery } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import UserDBContextManagerForAI from './UserDBContextManagerForAI';

// Centralized API layer
import { saveUserSettings } from '../api';

// Tab Panel Component
function TabPanel({ children, value, index, ...props }) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      {...props}
      sx={{ py: 2 }}
    >
      {value === index && children}
    </Box>
  );
}

// Setting Row Component for consistent styling
function SettingRow({ label, description, children, quickAccess = false }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 2,
        gap: 2,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" fontWeight={500}>
            {label}
          </Typography>
          {quickAccess && (
            <Chip
              label="Quick Access"
              size="small"
              sx={{
                height: 18,
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
              }}
            />
          )}
        </Box>
        {description && (
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        )}
      </Box>
      <Box sx={{ flexShrink: 0 }}>
        {children}
      </Box>
    </Box>
  );
}

function SettingsModal({ open, onClose }) {
  const { settings, updateSetting, resetSettings } = useAppTheme();
  const [activeTab, setActiveTab] = useState(0);
  const theme = useMuiTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Reusable style helper (DRY)
  const toggleButtonGroupStyles = {
    '& .MuiToggleButton-root': {
      px: 1.5,
      py: 0.5,
    },
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 3,
          backgroundImage: 'none',
          backgroundColor: theme.palette.background.paper,
          height: isMobile ? '100%' : 600,
          maxHeight: isMobile ? '100%' : 600,
        },
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 0,
        }}
      >
        <Typography variant="h6" component="span" fontWeight={600}>
          Settings
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      {/* Tabs - Scrollable on mobile for 4 tabs */}
      <Box sx={{ px: { xs: 1, sm: 3 }, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            minHeight: 44,
            '& .MuiTab-root': {
              minHeight: 44,
              minWidth: 'auto',
              px: { xs: 1.5, sm: 2 },
              textTransform: 'none',
              fontWeight: 500,
            },
          }}
        >
          <Tab
            icon={<PaletteOutlinedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Appearance"
          />
          <Tab
            icon={<PsychologyOutlinedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="AI"
          />
          <Tab
            icon={<StorageOutlinedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Database"
          />
          <Tab
            icon={<DataObjectOutlinedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="AI Context"
          />
        </Tabs>
      </Box>

      <DialogContent sx={{ pt: 0 }}>
        {/* === APPEARANCE TAB === */}
        <TabPanel value={activeTab} index={0}>
          <SettingRow
            label="Theme"
            description="Choose light or dark interface"
          >
            <ToggleButtonGroup
              value={settings.theme}
              exclusive
              onChange={(e, value) => value && updateSetting('theme', value)}
              size="small"
              sx={toggleButtonGroupStyles}
            >
              <ToggleButton value="light">
                <LightModeRoundedIcon sx={{ fontSize: 18 }} />
              </ToggleButton>
              <ToggleButton value="dark">
                <DarkModeRoundedIcon sx={{ fontSize: 18 }} />
              </ToggleButton>
            </ToggleButtonGroup>
          </SettingRow>

          <SettingRow
            label="Idle Animation"
            description={settings.theme === 'dark' 
              ? "Show starfield effect when idle" 
              : "Only available in dark theme"}
          >
            <Switch
              checked={settings.theme === 'dark' && (settings.idleAnimation ?? true)}
              onChange={(e) => updateSetting('idleAnimation', e.target.checked)}
              disabled={settings.theme !== 'dark'}
              color="primary"
            />
          </SettingRow>
        </TabPanel>

        {/* === AI TAB === */}
        <TabPanel value={activeTab} index={1}>
          <SettingRow
            label="Enable Thinking"
            description="Show AI's reasoning process"
            quickAccess
          >
            <Switch
              checked={settings.enableReasoning ?? true}
              onChange={(e) => updateSetting('enableReasoning', e.target.checked)}
              color="primary"
            />
          </SettingRow>

          {settings.enableReasoning && (
            <SettingRow
              label="Thinking Depth"
              description="Higher = more thorough but slower"
            >
              <ToggleButtonGroup
                value={settings.reasoningEffort ?? 'medium'}
                exclusive
                onChange={(e, v) => v && updateSetting('reasoningEffort', v)}
                size="small"
                sx={toggleButtonGroupStyles}
              >
                <ToggleButton value="low">Low</ToggleButton>
                <ToggleButton value="medium">Med</ToggleButton>
                <ToggleButton value="high">High</ToggleButton>
              </ToggleButtonGroup>
            </SettingRow>
          )}

          <SettingRow
            label="Response Style"
            description="How AI formats responses"
          >
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={settings.responseStyle ?? 'balanced'}
                onChange={(e) => updateSetting('responseStyle', e.target.value)}
              >
                <MenuItem value="concise">Concise</MenuItem>
                <MenuItem value="balanced">Balanced</MenuItem>
                <MenuItem value="detailed">Detailed</MenuItem>
              </Select>
            </FormControl>
          </SettingRow>
        </TabPanel>

        {/* === DATABASE TAB === */}
        <TabPanel value={activeTab} index={2}>
          <SettingRow
            label="Confirm Before Running"
            description="Show dialog before executing SQL"
          >
            <Switch
              checked={settings.confirmBeforeRun ?? true}
              onChange={(e) => updateSetting('confirmBeforeRun', e.target.checked)}
              color="primary"
            />
          </SettingRow>

          <SettingRow
            label="Query Timeout"
            description="Max wait time for results"
          >
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <Select
                value={settings.queryTimeout ?? 30}
                onChange={(e) => updateSetting('queryTimeout', e.target.value)}
              >
                <MenuItem value={10}>10 sec</MenuItem>
                <MenuItem value={30}>30 sec</MenuItem>
                <MenuItem value={60}>1 min</MenuItem>
                <MenuItem value={120}>2 min</MenuItem>
                <MenuItem value={300}>5 min</MenuItem>
              </Select>
            </FormControl>
          </SettingRow>

          <SettingRow
            label="Max Rows"
            description={settings.maxRows === 0 ? "⚠️ No limit - may slow down with large results" : "Limit results to prevent slowdown"}
          >
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={settings.maxRows ?? 1000}
                onChange={(e) => updateSetting('maxRows', e.target.value)}
              >
                <MenuItem value={100}>100</MenuItem>
                <MenuItem value={500}>500</MenuItem>
                <MenuItem value={1000}>1,000</MenuItem>
                <MenuItem value={5000}>5,000</MenuItem>
                <MenuItem value={10000}>10,000</MenuItem>
                <MenuItem value={0} sx={{ color: 'warning.main', fontWeight: 500 }}>No Limit ⚠️</MenuItem>
              </Select>
            </FormControl>
          </SettingRow>

          <SettingRow
            label="NULL Display"
            description="How to show NULL values"
          >
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <Select
                value={settings.nullDisplay ?? 'NULL'}
                onChange={(e) => updateSetting('nullDisplay', e.target.value)}
              >
                <MenuItem value="NULL">NULL</MenuItem>
                <MenuItem value="(null)">(null)</MenuItem>
                <MenuItem value="-">-</MenuItem>
                <MenuItem value="">(empty)</MenuItem>
              </Select>
            </FormControl>
          </SettingRow>

          <SettingRow
            label="Remember Connection"
            description="Auto-fill on next visit"
          >
            <Switch
              checked={settings.rememberConnection ?? false}
              onChange={(e) => updateSetting('rememberConnection', e.target.checked)}
              color="primary"
            />
          </SettingRow>

          <SettingRow
            label="Connection Persistence"
            description="How long to keep connection alive after closing tab"
          >
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={settings.connectionPersistence ?? 0}
                onChange={(e) => {
                  const value = e.target.value;
                  updateSetting('connectionPersistence', value);
                  // Sync to backend so ContextService can use it
                  saveUserSettings({ connectionPersistenceMinutes: value })
                    .catch(err => console.warn('Failed to sync setting:', err));
                }}
              >
                <MenuItem value={0}>Never</MenuItem>
                <MenuItem value={5}>5 minutes</MenuItem>
                <MenuItem value={15}>15 minutes</MenuItem>
                <MenuItem value={30}>30 minutes</MenuItem>
                <MenuItem value={60}>1 hour</MenuItem>
              </Select>
            </FormControl>
          </SettingRow>

          <SettingRow
            label="Default Database Type"
            description="Pre-selected when connecting"
          >
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={settings.defaultDbType ?? 'postgresql'}
                onChange={(e) => updateSetting('defaultDbType', e.target.value)}
              >
                <MenuItem value="mysql">MySQL</MenuItem>
                <MenuItem value="postgresql">PostgreSQL</MenuItem>
                <MenuItem value="sqlserver">SQL Server</MenuItem>
                <MenuItem value="oracle">Oracle</MenuItem>
                <MenuItem value="sqlite">SQLite</MenuItem>
              </Select>
            </FormControl>
          </SettingRow>
        </TabPanel>

        {/* === AI CONTEXT TAB === */}
        <TabPanel value={activeTab} index={3}>
          <UserDBContextManagerForAI />
        </TabPanel>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between', borderTop: 1, borderColor: 'divider' }}>
        <Button
          startIcon={<RestartAltRoundedIcon />}
          onClick={resetSettings}
          color="inherit"

        >
          Reset
        </Button>
        <Button color="primary" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default SettingsModal;
