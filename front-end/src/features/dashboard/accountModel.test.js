import assert from 'node:assert/strict';
import test from 'node:test';

const accountModel = await import('./accountModel.js').catch(() => ({}));

test('normalizes a non-empty display name and enforces the length boundary', () => {
  assert.equal(accountModel.normalizeDisplayName('  Ada Lovelace  '), 'Ada Lovelace');
  assert.throws(() => accountModel.normalizeDisplayName('   '), /required/i);
  assert.throws(() => accountModel.normalizeDisplayName('x'.repeat(81)), /80/i);
});

test('allows unlinking only when another sign-in method remains', () => {
  assert.equal(accountModel.canUnlinkProvider(['password', 'google.com'], 'google.com'), true);
  assert.equal(accountModel.canUnlinkProvider(['google.com'], 'google.com'), false);
  assert.equal(accountModel.canUnlinkProvider(['google.com'], 'github.com'), false);
});

test('builds storage keys inside the authenticated account namespace', () => {
  assert.equal(
    accountModel.getAccountStorageKey('user-1', 'saved-connection'),
    'moonlit:user-1:saved-connection',
  );
  assert.throws(() => accountModel.getAccountStorageKey('', 'settings'), /required/i);
});

test('clears only the deleted account namespace plus unowned legacy account data', () => {
  const removed = [];
  const storage = {
    length: 5,
    key: (index) => [
      'moonlit:user-1:settings',
      'moonlit:user-1:saved-connection',
      'moonlit:user-2:settings',
      'moonlit-settings',
      'unrelated',
    ][index],
    removeItem: (key) => removed.push(key),
  };

  accountModel.clearAccountStorage('user-1', storage);

  assert.deepEqual(removed.sort(), [
    'moonlit-settings',
    'moonlit:user-1:saved-connection',
    'moonlit:user-1:settings',
  ]);
});
