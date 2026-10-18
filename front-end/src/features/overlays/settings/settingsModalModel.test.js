import assert from 'node:assert/strict';
import test from 'node:test';

const settingsModalModel = await import('./settingsModalModel.js').catch(() => ({}));

test('reset is available only for preference sections', () => {
  assert.equal(typeof settingsModalModel.canResetSettingsSection, 'function');
  assert.equal(settingsModalModel.canResetSettingsSection('ai'), true);
  assert.equal(settingsModalModel.canResetSettingsSection('database'), true);
  assert.equal(settingsModalModel.canResetSettingsSection('context'), false);
});
