import {
  Button,
  Checkbox,
  CircularProgress,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { getContrastRatio, ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { getPreferenceToggleGroupSx } from '@/features/overlays/preference-surface/preferenceSurfaceStyles';
import { buildNavRowSx } from '@/features/sidebar-left/styles/sidebarStyles';
import QueryTabs from '@/features/sidebar-right/artifacts/sql-workspace/QueryTabs';
import { createMoonlitTheme } from './createMoonlitTheme';
import { createDarkTheme } from './darkTheme';
import { moonlitDarkSyntax } from './syntaxPalettes';
import { DARK } from './tokens';
import { createDarkSemanticTokens } from './tokens/semantic';

it('keeps default controls and selected navigation neutral', () => {
  const theme = createDarkTheme();
  expect(theme.palette.primary.main).toBe(theme.palette.text.primary);
  expect(buildNavRowSx(theme, { isActive: true }).color).toBe(theme.palette.text.primary);
});

it('renders opt-in accent actions without coloring default or disabled controls', () => {
  const theme = createMoonlitTheme(createDarkSemanticTokens('#f077af'), DARK);
  render(
    <ThemeProvider theme={theme}>
      <Button variant="contained">Ordinary</Button>
      <Button variant="contained" color="accent">
        Run
      </Button>
      <Button variant="contained" color="accent" disabled>
        Unavailable
      </Button>
      <Checkbox checked readOnly inputProps={{ 'aria-label': 'Enabled choice' }} />
      <Checkbox checked readOnly disabled inputProps={{ 'aria-label': 'Disabled choice' }} />
      <Checkbox checked readOnly color="error" inputProps={{ 'aria-label': 'Error choice' }} />
      <CircularProgress aria-label="Loading" />
    </ThemeProvider>,
  );
  const style = (name) => getComputedStyle(screen.getByRole('button', { name }));
  expect(style('Run').backgroundColor).toBe('rgb(240, 119, 175)');
  expect(style('Ordinary').backgroundColor).toBe('rgb(237, 237, 237)');
  expect(style('Unavailable').backgroundColor).not.toBe(style('Run').backgroundColor);
  expect(
    getComputedStyle(screen.getByRole('checkbox', { name: 'Enabled choice' }).parentElement).color,
  ).toBe('rgb(240, 119, 175)');
  expect(
    getComputedStyle(screen.getByRole('checkbox', { name: 'Disabled choice' }).parentElement).color,
  ).not.toBe('rgb(240, 119, 175)');
  expect(
    getComputedStyle(screen.getByRole('checkbox', { name: 'Error choice' }).parentElement).color,
  ).toBe('rgb(255, 154, 154)');
  expect(getComputedStyle(screen.getByRole('progressbar', { name: 'Loading' })).color).not.toBe(
    'rgb(240, 119, 175)',
  );
});

it('changes only interaction roles when the source accent changes', () => {
  const base = createDarkTheme();
  const blue = createMoonlitTheme(createDarkSemanticTokens('#66adf5'), DARK);
  expect(blue.palette.accent.main).toBe('#66adf5');
  expect(blue.palette.border.focus).toBe(base.palette.border.focus);
  expect(blue.palette.border.focus).toBe(blue.palette.text.secondary);
  expect(blue.palette.accent.selectedBackground).not.toBe(base.palette.accent.selectedBackground);
  for (const role of [
    'primary',
    'background',
    'text',
    'identity',
    'chart',
    'success',
    'error',
    'warning',
    'info',
    'semanticColors',
  ]) {
    expect(blue.palette[role]).toEqual(base.palette[role]);
  }
  expect(moonlitDarkSyntax.keyword).toBe('#f077af');
});

it.each([
  '#f077af',
  '#66adf5',
  '#172554',
  '#ffffff',
])('keeps %s readable across action and focus states', (accent) => {
  const { accent: colors, background, border } = createDarkSemanticTokens(accent);
  for (const state of ['main', 'hover', 'pressed']) {
    expect(getContrastRatio(colors[state], colors.contrastText)).toBeGreaterThanOrEqual(4.5);
  }
  for (const surface of ['default', 'paper', 'composer', 'elevated3']) {
    expect(getContrastRatio(border.focus, background[surface])).toBeGreaterThanOrEqual(3);
  }
});

it.each([
  '#f077af',
  '#66adf5',
])('keeps selected tabs and preference segments neutral with accent %s', (accent) => {
  const theme = createMoonlitTheme(createDarkSemanticTokens(accent), DARK);
  const { container } = render(
    <ThemeProvider theme={theme}>
      <ToggleButtonGroup value="schemas" exclusive sx={getPreferenceToggleGroupSx(theme)}>
        <ToggleButton value="schemas">Databases</ToggleButton>
        <ToggleButton value="queries">Queries</ToggleButton>
      </ToggleButtonGroup>
      <ToggleButtonGroup value="databases" exclusive>
        <ToggleButton value="connect">Connection</ToggleButton>
        <ToggleButton value="databases">Database list</ToggleButton>
      </ToggleButtonGroup>
      <Tabs value={0}>
        <Tab label="Overview" />
        <Tab label="Usage" />
      </Tabs>
      <QueryTabs tabs={[{ id: 'a', title: 'Query 1' }]} activeTabId="a" />
    </ThemeProvider>,
  );
  for (const name of ['Databases', 'Database list']) {
    const selected = screen.getByRole('button', { name });
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(getComputedStyle(selected).boxShadow).toBe('none');
  }
  expect(getComputedStyle(screen.getByRole('tab', { name: 'Query 1' })).boxShadow).toBe('none');
  const indicator = container.querySelector('.MuiTabs-indicator');
  expect(getComputedStyle(indicator).backgroundColor).toBe('rgb(205, 205, 205)');
});
