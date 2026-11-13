// Real components with synthetic data; no chat or SQL requests are submitted.
import { Profiler, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import {
  Box,
  Button,
  Checkbox,
  CssBaseline,
  Radio,
  Slider,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { DEFAULT_APPEARANCE, selectPreset, updateProfile } from '@/theme/appearance';
import MessageList from '@/features/chat/MessageList';
import ChatInput from '@/features/chat/ChatInput';
import SettingsModal from '@/features/overlays/settings/SettingsModal';
import SqlEditorSurface from '@/features/sidebar-right/artifacts/sql-workspace/SqlEditorSurface';
import PerspectiveDashboard from '@/features/sidebar-right/artifacts/data-visualization/PerspectiveDashboard';

const messages = [
  {
    id: 'user-1',
    role: 'user',
    text: 'Compare the quarterly totals. https://example.com stays plain user text.',
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    text: 'The totals are ready. [Reference](https://example.com) stays neutral.',
    status: 'done',
  },
];
const chartData = {
  columns: ['region', 'sales'],
  rows: [
    ['North', 42],
    ['South', 32],
  ],
};
export function Fixture() {
  const { settings, updateSetting } = useSettings();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [query, setQuery] = useState('SELECT 42 AS total; -- stable syntax');
  const [history, setHistory] = useState(messages);
  const [chart, setChart] = useState(false);
  useEffect(() => {
    window.accentQA = {
      set: (mode, accent, preset = 'chatgpt', customAccent = '#010203') => {
        const a = updateProfile(selectPreset(DEFAULT_APPEARANCE, mode, preset), mode, {
          accent,
          customAccent,
        });
        updateSetting('appearance', { ...a, mode });
      },
      open: setOpen,
      streaming: setStreaming,
      disabled: setDisabled,
      chart: setChart,
      appearancePatch: (patch) => updateSetting('appearance', { ...settings.appearance, ...patch }),
      append: () =>
        setHistory([...messages, { id: 'user-new', role: 'user', text: 'New synthetic message' }]),
      prepend: () =>
        setHistory([
          { id: 'user-old', role: 'user', text: 'Older synthetic message' },
          ...messages,
        ]),
      palette: theme.palette,
      appearance: settings.appearance,
    };
    return () => {
      delete window.accentQA;
    };
  }, [settings.appearance, theme.palette, updateSetting]);
  return (
    <>
      <CssBaseline />
      <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto', visibility: open ? 'hidden' : 'visible' }}>
        <Typography component="h1">Accent integration</Typography>
        <Typography id="prose">Selectable ordinary text</Typography>
        <TextField id="selection-input" defaultValue="Selectable input text" size="small" />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, my: 2 }}>
          <Switch defaultChecked slotProps={{ input: { 'aria-label': 'Accent switch' } }} />
          <Checkbox defaultChecked slotProps={{ input: { 'aria-label': 'Accent checkbox' } }} />
          <Radio checked readOnly slotProps={{ input: { 'aria-label': 'Accent radio' } }} />
          <Slider defaultValue={50} aria-label="Accent slider" sx={{ width: 100 }} />
          <Button onClick={() => setOpen(true)}>Settings</Button>
          <Button variant="contained">Neutral action</Button>
        </Box>
        <Box id="status-controls" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {['error', 'success', 'warning', 'info'].map((color) => (
            <Box key={color} data-status={color}>
              <Switch defaultChecked color={color} />
              <Checkbox defaultChecked color={color} />
              <Radio checked readOnly color={color} />
            </Box>
          ))}
          <Box id="disabled-controls">
            <Switch checked disabled />
            <Checkbox checked disabled />
            <Radio checked disabled />
          </Box>
        </Box>
        <MessageList sessionKey="accent-fixture" messages={history} />
        <ChatInput
          sessionKey="accent-fixture"
          selectedProvider="test"
          selectedModel="Model One"
          providerOptions={[{ name: 'test', models: ['Model One'] }]}
          isConnected
          disabled={disabled}
          isStreaming={streaming}
          onSend={() => {
            throw new Error('Fixture must never submit');
          }}
        />
        <Box sx={{ height: 130, mt: 2 }}>
          <SqlEditorSurface query={query} onQueryChange={setQuery} />
        </Box>
        {chart && (
          <Box sx={{ height: 300 }}>
            <PerspectiveDashboard
              data={chartData}
              onReadyChange={(ready) => {
                window.accentChartReady = ready;
              }}
            />
          </Box>
        )}
      </Box>
      <SettingsModal open={open} initialSection="general" onClose={() => setOpen(false)} />
    </>
  );
}
createRoot(document.getElementById('root')).render(
  <Profiler
    id="accent-fixture"
    onRender={(_id, phase, duration) => {
      window.accentPerf?.commits.push({ phase, duration });
    }}
  >
    <BrowserRouter>
      <ThemeProvider>
        <Fixture />
      </ThemeProvider>
    </BrowserRouter>
  </Profiler>,
);
