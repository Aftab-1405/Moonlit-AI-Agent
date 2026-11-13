import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_APPEARANCE,
  validateAppearance,
  updateProfile,
  selectPreset,
  importTheme,
  exportTheme,
} from './appearance.js';

test('invalid or old appearance records recover safely', () => {
  for (const value of [
    null,
    [],
    'dark',
    { version: 9 },
    { version: 1, mode: 'oops', profiles: { light: { surface: 'url(evil)' } } },
  ]) {
    const result = validateAppearance(value);
    assert.equal(result.version, 1);
    assert.ok(['system', 'light', 'dark'].includes(result.mode));
    assert.match(result.profiles.light.surface, /^#[0-9a-f]{6}$/i);
  }
});
test('linked choices propagate while surfaces and contrast remain independent', () => {
  let a = updateProfile(DEFAULT_APPEARANCE, 'light', {
    accent: 'purple',
    surface: '#eeeeee',
    contrast: 46,
  });
  assert.equal(a.profiles.dark.accent, 'purple');
  assert.equal(a.profiles.dark.surface, DEFAULT_APPEARANCE.profiles.dark.surface);
  a = updateProfile({ ...a, separateModes: true }, 'dark', { accent: 'white' });
  assert.equal(a.profiles.light.accent, 'purple');
  a = selectPreset(a, 'light', 'chatgpt');
  assert.equal(a.profiles.light.custom, false);
  assert.equal(a.profiles.light.contrast, 45);
});
test('bounded importer validates atomically and Moonlit export round trips', () => {
  const profile = selectPreset(DEFAULT_APPEARANCE, 'dark', 'chatgpt').profiles.dark;
  assert.deepEqual(importTheme(exportTheme(profile, 'dark')), { profile, mode: 'dark' });
  for (const value of [
    '',
    'codex-theme-v9:{}',
    'codex-theme-v1:{"variant":"dark","theme":{"surface":"red"}}',
    'x'.repeat(20001),
  ])
    assert.throws(() => importTheme(value));
  const parsed = importTheme(
    'codex-theme-v1:{"codeThemeId":"codex","variant":"light","theme":{"accent":"#a67df2","surface":"#fcfcfc","ink":"#0d0d0d","contrast":45,"fonts":{"ui":null,"code":null}}}',
  );
  assert.equal(parsed.mode, 'light');
  assert.equal(parsed.profile.customAccent, '#A67DF2');
});
test('unchanged profile edits do not enter the custom palette path', () => {
  const a = selectPreset(DEFAULT_APPEARANCE, 'light', 'chatgpt');
  const b = updateProfile(a, 'light', {
    surface: a.profiles.light.surface.toLowerCase(),
    contrast: 45,
  });
  assert.deepEqual(b, a);
  assert.equal(b.profiles.light.custom, false);
});
test('valid custom colors are honored even if an imported record has a stale custom flag', () => {
  const a = validateAppearance({
    ...DEFAULT_APPEARANCE,
    profiles: {
      ...DEFAULT_APPEARANCE.profiles,
      dark: { ...DEFAULT_APPEARANCE.profiles.dark, surface: '#FFFFFF', custom: false },
    },
  });
  assert.equal(a.profiles.dark.surface, '#FFFFFF');
  assert.equal(a.profiles.dark.custom, true);
});
