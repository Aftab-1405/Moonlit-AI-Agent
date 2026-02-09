import { useState } from 'react';
import {
  Dialog,
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
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
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
import { saveUserSettings } from '../api';
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
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: alpha(theme.palette.background.paper, 0.5),
        transition: 'border-color 0.15s ease',
        '&:hover': {
          borderColor: alpha(theme.palette.text.primary, 0.15),
        },
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
        {description && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {description}
          </Typography>
        )}
      </Box>
      <Box sx={{ flexShrink: 0, width: { xs: '100%', sm: 'auto' } }}>
        {children}
      </Box>
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
  const showSectionTitle = !isMobile;
  const toggleStyles = {
    '& .MuiToggleButton-root': { px: 1.5, py: 0.5 },
  };
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
                      onChange={(e, v) => v && updateSetting('theme', v)}
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
                    description={settings.theme === 'dark' ? 'Show starfield effect when idle' : 'Only available in dark theme'}
                    disabled={settings.theme !== 'dark'}
                  >
                    <Switch
                      checked={settings.theme === 'dark' && (settings.idleAnimation ?? true)}
                      onChange={(e) => updateSetting('idleAnimation', e.target.checked)}
                      disabled={settings.theme !== 'dark'}
                    />
                  </SettingItem>
                </SettingCard>

                <SettingCard>
                  <SettingItem
                    label="Idle Intensity"
                    description="Control starfield brightness when idle"
                    disabled={settings.theme !== 'dark' || !(settings.idleAnimation ?? true)}
                  >
                    <ToggleButtonGroup
                      value={settings.idleAnimationIntensity ?? 'medium'}
                      exclusive
                      onChange={(e, v) => v && updateSetting('idleAnimationIntensity', v)}
                      size="small"
                      disabled={settings.theme !== 'dark' || !(settings.idleAnimation ?? true)}
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

                {settings.enableReasoning && (
                  <SettingCard>
                    <SettingItem label="Thinking Depth" description="Higher = more thorough but slower">
                      <ToggleButtonGroup
                        value={settings.reasoningEffort ?? 'medium'}
                        exclusive
                        onChange={(e, v) => v && updateSetting('reasoningEffort', v)}
                        size="small"
                        sx={toggleStyles}
                      >
                        <ToggleButton value="low">Low</ToggleButton>
                        <ToggleButton value="medium">Med</ToggleButton>
                        <ToggleButton value="high">High</ToggleButton>
                      </ToggleButtonGroup>
                    </SettingItem>
                  </SettingCard>
                )}

                <SettingCard>
                  <SettingItem label="Response Style" description="How AI formats responses">
                    <FormControl size="small" sx={{ minWidth: 110 }}>
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
                  </SettingItem>

                  <SettingItem
                    label="Max Rows"
                    description={settings.maxRows === 0 ? '⚠️ No limit - may slow down' : 'Limit results to prevent slowdown'}
                  >
                    <FormControl size="small" sx={{ minWidth: 110 }}>
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
                    <FormControl size="small" sx={{ minWidth: 110 }}>
                      <Select
                        value={settings.connectionPersistence ?? 0}
                        onChange={(e) => {
                          const value = e.target.value;
                          updateSetting('connectionPersistence', value);
                          saveUserSettings({ connectionPersistenceMinutes: value })
                            .catch(err => logger.warn('Failed to sync setting:', err));
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 3,
          backgroundImage: 'none',
          backgroundColor: theme.palette.background.paper,
          height: isMobile ? '100%' : 'calc(100vh - 64px)',
          maxHeight: isMobile ? '100%' : 720,
          minHeight: isMobile ? '100%' : 400,
          overflow: 'hidden',
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 2, sm: 3 },
          py: 2,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isMobile && (
            <IconButton
              size="small"
              onClick={() => setMobileNavOpen(true)}
              sx={{ mr: 0.5, width: 44, height: 44 }}
            >
              <MenuRoundedIcon />
            </IconButton>
          )}
          {isMobile && (
            <Typography variant="h6" fontWeight={600}>
              {activeSectionLabel}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ width: 44, height: 44 }}>
          <CloseRoundedIcon />
        </IconButton>
      </Box>
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {!isMobile && (
          <Box
            sx={{
              width: 200,
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              backgroundColor: alpha(theme.palette.background.default, 0.5),
            }}
          >
            {NavContent}
          </Box>
        )}
        {isMobile && (
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
                height: '100%',
                overflowY: 'auto',
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
        )}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            p: { xs: 2, sm: 3 },
          }}
        >
          {renderContent()}
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 2, sm: 3 },
          py: 2,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Button
          startIcon={<RestartAltRoundedIcon />}
          onClick={resetSettings}
          color="inherit"
          size="small"
        >
          Reset All
        </Button>
        <Button onClick={onClose} size="small">
          Done
        </Button>
      </Box>
    </Dialog>
  );
}

export default SettingsModal;
