import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSettingsSection, searchSettings } from './settingsRegistry.js';

test('legacy settings IDs retain their destinations', () => {
  assert.equal(normalizeSettingsSection('ai'), 'general');
  assert.equal(normalizeSettingsSection('context'), 'ai-context');
  assert.equal(normalizeSettingsSection('missing'), 'general');
});

test('search finds individual settings by descriptions and trims case-insensitively', () => {
  const font = searchSettings('  FONT  ');
  assert.equal(font.length, 1);
  assert.equal(font[0].section, 'appearance');
  assert.equal(font[0].target, 'appearance-font');
  assert.ok(searchSettings('SQL').some(({ target }) => target === 'setting-confirmBeforeRun'));
  assert.ok(searchSettings('app').some(({ section }) => section === 'appearance'));
  assert.deepEqual(searchSettings('unmatched settings query'), []);
});
