import { expect, it } from 'vitest';
import { getContrastRatio } from '@mui/material/styles';
import { DEFAULT_APPEARANCE, selectPreset, updateProfile } from './appearance';
import { createAppearanceSemanticTokens } from './tokens/semantic';
import { createComponentTokens } from './tokens/component';
import { createMoonlitTheme } from './createMoonlitTheme';
it.each([
  'light',
  'dark',
])('resolves measured ChatGPT %s baseline and readable defaults', (mode) => {
  const a = selectPreset(DEFAULT_APPEARANCE, mode, 'chatgpt');
  const tokens = createAppearanceSemanticTokens(a, mode);
  const theme = createMoonlitTheme(tokens, createComponentTokens(tokens));
  expect(theme.palette.background.default).toBe(mode === 'dark' ? '#0E0E0E' : '#FCFCFC');
  expect(theme.palette.background.composer).toBe(mode === 'dark' ? '#212121' : '#FFFFFF');
  expect(theme.palette.text.primary).toBe(mode === 'dark' ? '#EDEDED' : '#0D0D0D');
  expect(theme.palette.accent.base).toBe('#A67DF2');
  expect(
    getContrastRatio(theme.palette.text.primary, theme.palette.background.default),
  ).toBeGreaterThan(4.5);
  expect(
    getContrastRatio(theme.palette.accent.main, theme.palette.accent.contrastText),
  ).toBeGreaterThan(4.5);
  const custom = createAppearanceSemanticTokens(updateProfile(a, mode, { contrast: 46 }), mode);
  expect(custom.background.paper).not.toBe(tokens.background.paper);
});
it.each([
  'light',
  'dark',
])('keeps White accent text and custom foreground readable in %s', (mode) => {
  const a = updateProfile(DEFAULT_APPEARANCE, mode, {
    accent: 'white',
    ink: '#FFFFFF',
    surface: '#FFFFFF',
  });
  const tokens = createAppearanceSemanticTokens(a, mode);
  expect(getContrastRatio(tokens.text.primary, tokens.background.default)).toBeGreaterThanOrEqual(
    4.5,
  );
  expect(
    getContrastRatio(tokens.accent.foreground, tokens.background.default),
  ).toBeGreaterThanOrEqual(4.5);
});
it('validates generated theme metadata and never adds appearance to remote-sync payloads', async () => {
  const { pickSyncableSettings } = await import('@/config/userSettings');
  expect(pickSyncableSettings({ appearance: DEFAULT_APPEARANCE, queryTimeout: 30 })).toEqual({
    queryTimeout: 30,
  });
});
it('preserves the original Moonlit dark palette when its preset is selected', async () => {
  const { createDarkSemanticTokens } = await import('./tokens/semantic');
  const original = createDarkSemanticTokens(),
    selected = createAppearanceSemanticTokens(DEFAULT_APPEARANCE, 'dark');
  for (const role of [
    'background',
    'text',
    'border',
    'action',
    'layer',
    'primary',
    'secondary',
    'identity',
    'divider',
  ])
    expect(selected[role]).toEqual(original[role]);
});
it.each([
  'light',
  'dark',
])('uses the neutral default accent after Moonlit preset/reset in %s', (mode) => {
  const changed = updateProfile(DEFAULT_APPEARANCE, mode, { accent: 'pink' });
  expect(createAppearanceSemanticTokens(changed, mode).accent.base).toBe('#FA70AB');
  const restored = selectPreset(changed, mode, 'moonlit');
  for (const record of [restored, DEFAULT_APPEARANCE]) {
    const s = createAppearanceSemanticTokens(record, mode);
    expect(s.accent.base).toBe(mode === 'dark' ? '#FFFFFF' : '#0D0D0D');
    expect(s.accent.main).toBe(mode === 'dark' ? '#FFFFFF' : '#0D0D0D');
  }
});
it('keeps the standalone dark theme on the same neutral default accent', async () => {
  const { createDarkTheme } = await import('./index');
  expect(createDarkTheme().palette.accent.main).toBe('#FFFFFF');
});
