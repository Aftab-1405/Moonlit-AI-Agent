import assert from 'node:assert/strict';
import test from 'node:test';
import { getAdminRouteDecision, getProtectedRouteDecision } from './routeGuardModel.js';

test('protected route waits for authentication resolution', () => {
  assert.equal(getProtectedRouteDecision({ loading: true, isAuthenticated: false }), 'loading');
});

test('protected route sends anonymous users to login', () => {
  assert.deepEqual(getProtectedRouteDecision({ loading: false, isAuthenticated: false }), {
    redirectTo: '/login',
  });
});

test('protected route allows authenticated users', () => {
  assert.equal(getProtectedRouteDecision({ loading: false, isAuthenticated: true }), 'allow');
});

test('admin route waits before evaluating access', () => {
  assert.equal(
    getAdminRouteDecision({
      loading: true,
      isAuthenticated: false,
      userUid: null,
      adminUid: null,
    }),
    'loading',
  );
});

test('admin route sends anonymous users to login', () => {
  assert.deepEqual(
    getAdminRouteDecision({
      loading: false,
      isAuthenticated: false,
      userUid: null,
      adminUid: 'admin-uid',
    }),
    { redirectTo: '/login' },
  );
});

test('admin route fails closed when admin configuration is absent', () => {
  assert.deepEqual(
    getAdminRouteDecision({
      loading: false,
      isAuthenticated: true,
      userUid: 'admin-uid',
      adminUid: '',
    }),
    { redirectTo: '/chat' },
  );
});

test('admin route treats whitespace-only configuration as absent', () => {
  assert.deepEqual(
    getAdminRouteDecision({
      loading: false,
      isAuthenticated: true,
      userUid: 'admin-uid',
      adminUid: '   ',
    }),
    { redirectTo: '/chat' },
  );
});

test('admin route rejects a non-admin user', () => {
  assert.deepEqual(
    getAdminRouteDecision({
      loading: false,
      isAuthenticated: true,
      userUid: 'user-uid',
      adminUid: 'admin-uid',
    }),
    { redirectTo: '/chat' },
  );
});

test('admin route allows the configured admin', () => {
  assert.equal(
    getAdminRouteDecision({
      loading: false,
      isAuthenticated: true,
      userUid: 'admin-uid',
      adminUid: 'admin-uid',
    }),
    'allow',
  );
});
