import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getEffectiveThemeMode,
  getReducedMotion,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
} from './mode.js';
test('explicit modes override the OS on every route', () => {
  for (const path of ['/', '/login', '/chat', '/settings/appearance', '/admin']) {
    assert.equal(getEffectiveThemeMode(path, 'light', true), 'light');
    assert.equal(getEffectiveThemeMode(path, 'dark', false), 'dark');
  }
});
test('system resolves independently from reduced motion', () => {
  assert.equal(getEffectiveThemeMode(null, 'system', true), 'dark');
  assert.equal(getEffectiveThemeMode(null, 'system', false), 'light');
  assert.equal(getReducedMotion('on', false), true);
  assert.equal(getReducedMotion('off', true), false);
  assert.equal(getReducedMotion('system', true), true);
  assert.equal(THEME_ATTRIBUTE, 'data-moonlit-color-scheme');
  assert.equal(THEME_STORAGE_KEY, 'moonlit-settings');
});
