import { useMemo, useState } from 'react';
import {
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
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Fade,
  useMediaQuery,
  Drawer,
} from '@mui/material';
import { alpha, useTheme as useMuiTheme } from '@mui/material/styles';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import UserDBContextManagerForAI from './UserDBContextManagerForAI';
import DialogShell from './DialogShell';
import { saveUserSettings } from '../api';
import {
  DIALOG_VIEWPORT_SUPPORT_QUERY,
  getCompactActionSx,
  getDialogNavPaneSx,
  getDialogScrollablePaneSx,
  getInsetPanelSx,
  UI_LAYOUT,
} from '../styles/shared';
import logger from '../utils/logger';

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: PaletteOutlinedIcon },
  { id: 'ai', label: 'AI', icon: PsychologyOutlinedIcon },
  { id: 'database', label: 'Database', icon: StorageOutlinedIcon },
  { id: 'context', label: 'AI Context', icon: DataObjectOutlinedIcon },
];

function SettingCard({ children, sx = {} }) {
  const theme = useMuiTheme();
  return (
    <Box
      sx={{
        ...getInsetPanelSx(theme, { enableHover: true }),
        p: 2,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function SettingItem({ label, description, children, disabled = false }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        gap: { xs: 1.25, sm: 2 },
        opacity: disabled ? 0.5 : 1,
        py: 1,
        '&:first-of-type': { pt: 0 },
        '&:last-of-type': { pb: 0 },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={500}>
          {label}
        </Typography>
        {description ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {description}
          </Typography>
        ) : null}
      </Box>
      <Box sx={{ flexShrink: 0, width: { xs: '100%', sm: 'auto' } }}>{children}</Box>
    </Box>
  );
}

function SectionTitle({ children, visible = true }) {
  if (!visible) return null;
  return (
    <Typography variant="h6" fontWeight={600} sx={{ mb: 2.5 }}>
      {children}
    </Typography>
  );
}

function SettingsModal({ open, onClose }) {
  const { settings, updateSetting, resetSettings } = useAppTheme();
  const [activeSection, setActiveSection] = useState('appearance');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const theme = useMuiTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const activeSectionLabel = SECTIONS.find((section) => section.id === activeSection)?.label || 'Settings';
  const isDarkTheme = settings.theme === 'dark';
  const idleAnimationEnabled = isDarkTheme && (settings.idleAnimation ?? true);
  const idleControlsDisabled = !isDarkTheme || !idleAnimationEnabled;
  const showSectionTitle = !isMobile;
  const toggleStyles = useMemo(() => ({
    width: { xs: '100%', sm: 'auto' },
    '& .MuiToggleButton-root': {
      px: { xs: 1, sm: 1.5 },
      py: { xs: 0.75, sm: 0.5 },
      minHeight: { xs: UI_LAYOUT.compactTouchTarget, sm: 34 },
      flex: { xs: 1, sm: 'unset' },
    },
  }), []);

  const NavContent = (
    <List sx={{ p: 1.5 }}>
      {SECTIONS.map((section) => (
        <ListItemButton
          key={section.id}
          selected={activeSection === section.id}
          onClick={() => {
            setActiveSection(section.id);
            if (isMobile) setMobileNavOpen(false);
          }}
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
            <section.icon sx={{ fontSize: 20, color: activeSection === section.id ? 'text.primary' : 'text.secondary' }} />
          </ListItemIcon>
          <ListItemText
            primary={section.label}
            primaryTypographyProps={{
              variant: 'body2',
              fontWeight: activeSection === section.id ? 600 : 500,
            }}
          />
        </ListItemButton>
      ))}
    </List>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'appearance':
        return (
          <Fade in key="appearance">
            <Box>
              <SectionTitle visible={showSectionTitle}>Appearance</SectionTitle>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <SettingCard>
                  <SettingItem label="Theme" description="Choose light or dark interface">
                    <ToggleButtonGroup
                      value={settings.theme}
                      exclusive
                      onChange={(e, value) => value && updateSetting('theme', value)}
                      size="small"
                      sx={toggleStyles}
                    >
                      <ToggleButton value="light">
                        <LightModeRoundedIcon sx={{ fontSize: 18 }} />
                      </ToggleButton>
                      <ToggleButton value="dark">
                        <DarkModeRoundedIcon sx={{ fontSize: 18 }} />
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </SettingItem>
                </SettingCard>
                <SettingCard>
                  <SettingItem
                    label="Idle Animation"
                    description={isDarkTheme ? 'Show starfield effect when idle' : 'Only available in dark theme'}
                    disabled={!isDarkTheme}
                  >
                    <Switch
                      checked={idleAnimationEnabled}
                      onChange={(e) => updateSetting('idleAnimation', e.target.checked)}
                      disabled={!isDarkTheme}
                    />
                  </SettingItem>
                </SettingCard>
                <SettingCard>
                  <SettingItem
                    label="Idle Intensity"
                    description="Control starfield brightness when idle"
                    disabled={idleControlsDisabled}
                  >
                    <ToggleButtonGroup
                      value={settings.idleAnimationIntensity ?? 'medium'}
                      exclusive
                      onChange={(e, value) => value && updateSetting('idleAnimationIntensity', value)}
                      size="small"
                      disabled={idleControlsDisabled}
                      sx={toggleStyles}
                    >
                      <ToggleButton value="low">Low</ToggleButton>
                      <ToggleButton value="medium">Med</ToggleButton>
                      <ToggleButton value="high">High</ToggleButton>
                    </ToggleButtonGroup>
                  </SettingItem>
                </SettingCard>
              </Box>
            </Box>
          </Fade>
        );
      case 'ai':
        return (
          <Fade in key="ai">
            <Box>
              <SectionTitle visible={showSectionTitle}>AI Settings</SectionTitle>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <SettingCard>
                  <SettingItem label="Enable Thinking" description="Show AI's reasoning process">
                    <Switch
                      checked={settings.enableReasoning ?? true}
                      onChange={(e) => updateSetting('enableReasoning', e.target.checked)}
                    />
                  </SettingItem>
                </SettingCard>
                {settings.enableReasoning ? (
                  <SettingCard>
                    <SettingItem label="Thinking Depth" description="Higher = more thorough but slower">
                      <ToggleButtonGroup
                        value={settings.reasoningEffort ?? 'medium'}
                        exclusive
                        onChange={(e, value) => value && updateSetting('reasoningEffort', value)}
                        size="small"
                        sx={toggleStyles}
                      >
                        <ToggleButton value="low">Low</ToggleButton>
                        <ToggleButton value="medium">Med</ToggleButton>
                        <ToggleButton value="high">High</ToggleButton>
                      </ToggleButtonGroup>
                    </SettingItem>
                  </SettingCard>
                ) : null}
                <SettingCard>
                  <SettingItem label="Response Style" description="How AI formats responses">
                    <FormControl size="small" sx={{ minWidth: { sm: 110 }, width: { xs: '100%', sm: 'auto' } }}>
                      <Select
                        value={settings.responseStyle ?? 'balanced'}
                        onChange={(e) => updateSetting('responseStyle', e.target.value)}
                      >
                        <MenuItem value="concise">Concise</MenuItem>
                        <MenuItem value="balanced">Balanced</MenuItem>
                        <MenuItem value="detailed">Detailed</MenuItem>
                      </Select>
                    </FormControl>
                  </SettingItem>
                </SettingCard>
              </Box>
            </Box>
          </Fade>
        );
      case 'database':
        return (
          <Fade in key="database">
            <Box>
              <SectionTitle visible={showSectionTitle}>Database Settings</SectionTitle>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <SettingCard>
                  <SettingItem label="Confirm Before Running" description="Show dialog before executing SQL">
                    <Switch
                      checked={settings.confirmBeforeRun ?? true}
                      onChange={(e) => updateSetting('confirmBeforeRun', e.target.checked)}
                    />
                  </SettingItem>
                </SettingCard>
                <SettingCard sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <SettingItem label="Query Timeout" description="Max wait time for results">
                    <FormControl size="small" sx={{ minWidth: { sm: 100 }, width: { xs: '100%', sm: 'auto' } }}>
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
                  </SettingItem>
                  <SettingItem
                    label="Max Rows"
                    description={settings.maxRows === 0 ? '⚠️ No limit - may slow down' : 'Limit results to prevent slowdown'}
                  >
                    <FormControl size="small" sx={{ minWidth: { sm: 110 }, width: { xs: '100%', sm: 'auto' } }}>
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
                  </SettingItem>
                </SettingCard>
                <SettingCard>
                  <SettingItem label="NULL Display" description="How to show NULL values">
                    <FormControl size="small" sx={{ minWidth: { sm: 100 }, width: { xs: '100%', sm: 'auto' } }}>
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
                  </SettingItem>
                </SettingCard>
                <SettingCard sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <SettingItem label="Remember Connection" description="Auto-fill on next visit">
                    <Switch
                      checked={settings.rememberConnection ?? false}
                      onChange={(e) => updateSetting('rememberConnection', e.target.checked)}
                    />
                  </SettingItem>
                  <SettingItem label="Connection Persistence" description="Keep alive after closing tab">
                    <FormControl size="small" sx={{ minWidth: { sm: 110 }, width: { xs: '100%', sm: 'auto' } }}>
                      <Select
                        value={settings.connectionPersistence ?? 0}
                        onChange={(e) => {
                          const value = e.target.value;
                          updateSetting('connectionPersistence', value);
                          saveUserSettings({ connectionPersistenceMinutes: value })
                            .catch((error) => logger.warn('Failed to sync setting:', error));
                        }}
                      >
                        <MenuItem value={0}>Never</MenuItem>
                        <MenuItem value={5}>5 min</MenuItem>
                        <MenuItem value={15}>15 min</MenuItem>
                        <MenuItem value={30}>30 min</MenuItem>
                        <MenuItem value={60}>1 hour</MenuItem>
                      </Select>
                    </FormControl>
                  </SettingItem>
                  <SettingItem label="Default Database Type" description="Pre-selected when connecting">
                    <FormControl size="small" sx={{ minWidth: { sm: 120 }, width: { xs: '100%', sm: 'auto' } }}>
                      <Select
                        value={settings.defaultDbType ?? 'postgresql'}
                        onChange={(e) => updateSetting('defaultDbType', e.target.value)}
                      >
                        <MenuItem value="mysql">MySQL</MenuItem>
                        <MenuItem value="postgresql">PostgreSQL</MenuItem>
                        <MenuItem value="sqlserver">SQL Server</MenuItem>
                        <MenuItem value="oracle">Oracle</MenuItem>

                      </Select>
                    </FormControl>
                  </SettingItem>
                </SettingCard>
              </Box>
            </Box>
          </Fade>
        );
      case 'context':
        return (
          <Fade in key="context">
            <Box>
              <SectionTitle visible={showSectionTitle}>AI Context</SectionTitle>
              <UserDBContextManagerForAI />
            </Box>
          </Fade>
        );
      default:
        return null;
    }
  };

  const mobileNavButton = isMobile ? (
    <IconButton
      size="small"
      onClick={() => setMobileNavOpen(true)}
      aria-label="Open settings sections"
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
        headerLeading={mobileNavButton}
        headerTitle={isMobile ? activeSectionLabel : 'Settings'}
        bodySx={{ flexDirection: 'row' }}
        footer={(
          <>
            <Button
              startIcon={<RestartAltRoundedIcon />}
              onClick={resetSettings}
              color="inherit"
              size="small"
              sx={{ minHeight: { xs: UI_LAYOUT.compactTouchTarget, sm: 'auto' } }}
            >
              Reset All
            </Button>
            <Button onClick={onClose} size="small" sx={{ minHeight: { xs: UI_LAYOUT.compactTouchTarget, sm: 'auto' } }}>
              Done
            </Button>
          </>
        )}
      >
        {!isMobile ? (
          <Box sx={getDialogNavPaneSx(theme, 200)}>
            {NavContent}
          </Box>
        ) : null}
        <Box sx={getDialogScrollablePaneSx()}>
          {renderContent()}
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
              width: 240,
              maxWidth: '85vw',
              height: '100vh',
              [DIALOG_VIEWPORT_SUPPORT_QUERY]: {
                height: '100dvh',
              },
              overflowY: 'auto',
              paddingBottom: 'env(safe-area-inset-bottom)',
              backgroundColor: theme.palette.background.paper,
            },
          }}
        >
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Settings
            </Typography>
          </Box>
          {NavContent}
        </Drawer>
      ) : null}
    </>
  );
}

export default SettingsModal;
