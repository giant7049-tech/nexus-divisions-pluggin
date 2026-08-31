import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveAuthRoute,
  shouldRequireAuthentication,
  AUTH_PUBLIC_ROUTES,
} from '../../public/js/auth-gate.js';

test('public auth routes remain available before sign-in', () => {
  assert.equal(AUTH_PUBLIC_ROUTES.has('/auth/login'), true);
  assert.equal(AUTH_PUBLIC_ROUTES.has('/auth/register'), true);
  assert.equal(shouldRequireAuthentication('/auth/login', false), false);
  assert.equal(shouldRequireAuthentication('/auth/register', false), false);
});

test('private routes redirect unauthenticated visitors to the auth screen', () => {
  assert.equal(resolveAuthRoute('/', false), '/auth/login');
  assert.equal(resolveAuthRoute('/connect', false), '/auth/login');
  assert.equal(resolveAuthRoute('/auth/login', false), '/auth/login');
});

test('signed-in users can reach the dashboard and auth pages are redirected away', () => {
  assert.equal(shouldRequireAuthentication('/connect', true), false);
  assert.equal(resolveAuthRoute('/auth/login', true), '/');
  assert.equal(resolveAuthRoute('/jobs', true), '/jobs');
});
