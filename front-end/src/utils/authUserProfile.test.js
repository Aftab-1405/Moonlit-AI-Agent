import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAuthTimestamp, normalizeAuthUser } from './authUserProfile.js';

test('normalizes safe account metadata and de-duplicates friendly providers', () => {
  const user = normalizeAuthUser(
    {
      uid: 'firebase-user',
      email: 'disha@example.com',
      displayName: 'Disha Patani',
      photoURL: 'https://example.com/avatar.png',
      emailVerified: true,
      providerData: [
        { providerId: 'password' },
        { providerId: 'google.com' },
        { providerId: 'google.com' },
      ],
      metadata: {
        creationTime: '2024-01-15T10:00:00.000Z',
        lastSignInTime: '2026-08-15T08:30:00.000Z',
      },
    },
    {},
  );

  assert.deepEqual(user.providers, ['Email', 'Google']);
  assert.deepEqual(user.providerIds, ['password', 'google.com']);
  assert.equal(user.emailVerified, true);
  assert.equal(user.createdAt, '2024-01-15T10:00:00.000Z');
  assert.equal(user.lastSignInAt, '2026-08-15T08:30:00.000Z');
  assert.equal('providerData' in user, false);
  assert.equal('metadata' in user, false);
});

test('prefers explicit backend metadata and safely omits invalid dates', () => {
  const user = normalizeAuthUser(
    {
      uid: 'firebase-user',
      email: 'disha@example.com',
      emailVerified: true,
      providerData: [{ providerId: 'password' }],
      metadata: { creationTime: 'not-a-date' },
    },
    {
      verified: false,
      providers: ['github.com', 'microsoft.com'],
      lastSignInAt: '2026-08-14T12:00:00.000Z',
    },
  );

  assert.equal(user.emailVerified, false);
  assert.deepEqual(user.providers, ['GitHub', 'Microsoft', 'Email']);
  assert.deepEqual(user.providerIds, ['github.com', 'microsoft.com', 'password']);
  assert.equal(user.createdAt, null);
  assert.equal(user.lastSignInAt, '2026-08-14T12:00:00.000Z');
  assert.equal(normalizeAuthTimestamp('invalid'), null);
});
