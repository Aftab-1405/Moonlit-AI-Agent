// Synthetic local data; the controls and providers below are production components.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CssBaseline,
  FormControl,
  InputBase,
  MenuItem,
  Select,
  Slider,
  Switch,
  TextField,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { ConversationItem } from '@/features/sidebar-left/components/SidebarPrimitives';
import ChatInput from '@/features/chat/ChatInput';
import SqlEditorSurface from '@/features/sidebar-right/artifacts/sql-workspace/SqlEditorSurface';
import SettingsModal from '@/features/overlays/settings/SettingsModal';
import DatabaseModal from '@/features/overlays/database/DatabaseModal';
import PerspectiveDashboard from '@/features/sidebar-right/artifacts/data-visualization/PerspectiveDashboard';
import Auth from '@/pages/Auth';
import { getOutlinedFieldStateSx } from '@/styles/shared';
import { getPreferenceControlSx } from '@/features/overlays/preference-surface';

const providers = [{ name: 'test', label: 'Test provider', models: ['Model One', 'Model Two'] }];
const chartData = {
  columns: ['region', 'sales'],
  rows: [
    ['North', 42],
    ['South', 32],
  ],
};
export function Fixture() {
  const { settings, updateSetting } = useSettings(),
    theme = useTheme();
  const [surface, setSurface] = useState('controls'),
    [selection, setSelection] = useState('one'),
    [query, setQuery] = useState('SELECT 1;');
  useEffect(() => {
    window.focusQA = {
      open: setSurface,
      mode: (mode) => updateSetting('appearance', { ...settings.appearance, mode }),
      palette: theme.palette,
    };
    return () => {
      delete window.focusQA;
    };
  }, [settings.appearance, updateSetting, theme.palette]);
  return (
    <>
      <CssBaseline />
      {surface === 'auth' ? (
        <Auth />
      ) : (
        <Box sx={{ p: 3, visibility: surface === 'controls' ? 'visible' : 'hidden' }}>
          <h1>Application interaction controls</h1>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3,minmax(0,1fr))' },
              gap: 2,
              maxWidth: 1050,
            }}
          >
            <Button id="focus-start">Action</Button>
            <TextField label="Global search" inputProps={{ 'aria-label': 'Global search' }} />
            <TextField
              label="Auth field"
              inputProps={{ 'aria-label': 'Auth field' }}
              sx={getOutlinedFieldStateSx(theme)}
            />
            <FormControl sx={getPreferenceControlSx(theme, { variant: 'settings' })}>
              <Select
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                inputProps={{ 'aria-label': 'Preference select' }}
              >
                <MenuItem value="one">One</MenuItem>
                <MenuItem value="two">Two</MenuItem>
              </Select>
            </FormControl>
            <FormControl>
              <Select
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                inputProps={{ 'aria-label': 'Global select' }}
              >
                <MenuItem value="one">One</MenuItem>
                <MenuItem value="two">Two</MenuItem>
              </Select>
            </FormControl>
            <Autocomplete
              options={['North', 'South']}
              renderInput={(params) => <TextField {...params} label="Autocomplete" />}
            />
            <TextField
              variant="standard"
              label="Database standard"
              inputProps={{ 'aria-label': 'Database standard' }}
            />
            <TextField
              variant="filled"
              label="Filled field"
              inputProps={{ 'aria-label': 'Filled field' }}
            />
            <InputBase
              placeholder="Borderless search"
              inputProps={{ 'aria-label': 'Borderless search' }}
            />
            <TextField
              error
              label="Invalid field"
              defaultValue="invalid"
              helperText="Keep validation feedback"
              inputProps={{ 'aria-label': 'Invalid field' }}
            />
            <TextField
              disabled
              label="Disabled field"
              inputProps={{ 'aria-label': 'Disabled field' }}
            />
            <Box
              component="input"
              aria-label="Native hex"
              defaultValue="#AABBCC"
              sx={{
                background: 'transparent',
                color: 'inherit',
                border: '1px solid',
                borderColor: 'divider',
                '&:focus-visible': { outline: '2px solid', outlineColor: 'text.secondary' },
              }}
            />
            <Checkbox inputProps={{ 'aria-label': 'Checked state' }} />
            <Switch slotProps={{ input: { 'aria-label': 'Switch state' } }} />
            <Slider aria-label="Control slider" defaultValue={50} />
          </Box>
          <Box component="ul" sx={{ p: 0, width: 300, mt: 3 }}>
            <ConversationItem
              conv={{ id: 'focus-chat', title: 'Focus conversation' }}
              isActive={false}
              onSelect={() => {}}
              onDelete={() => {}}
            />
          </Box>
          <Box sx={{ maxWidth: 768, mt: 3 }}>
            <ChatInput
              providerOptions={providers}
              selectedProvider="test"
              selectedModel="Model One"
              onSend={() => {}}
              onSelectLlm={() => {}}
            />
          </Box>
          <Box sx={{ height: 160, maxWidth: 768, mt: 2 }}>
            <SqlEditorSurface query={query} onQueryChange={setQuery} />
          </Box>
        </Box>
      )}
      {surface === 'chart' && (
        <Box sx={{ position: 'fixed', inset: 24 }}>
          <PerspectiveDashboard
            data={chartData}
            onReadyChange={(ready) => {
              window.focusChartReady = ready;
            }}
          />
        </Box>
      )}
      <SettingsModal
        open={surface === 'general' || surface === 'appearance'}
        initialSection={surface === 'appearance' ? 'appearance' : 'general'}
        onClose={() => setSurface('controls')}
      />
      {surface === 'database' && (
        <DatabaseModal
          open
          onClose={() => setSurface('controls')}
          isConnected={false}
          availableDatabases={[]}
        />
      )}
    </>
  );
}
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ThemeProvider>
      <Fixture />
    </ThemeProvider>
  </BrowserRouter>,
);
