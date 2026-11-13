import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authModeFromPath, isAuthPath, AUTH_PATHS } from '../../src/lib/authPaths.js';

test('chaque écran auth a sa route', () => {
  assert.equal(authModeFromPath(AUTH_PATHS.signin), 'signin');
  assert.equal(authModeFromPath(AUTH_PATHS.signup), 'signup');
  assert.equal(authModeFromPath(AUTH_PATHS.reset), 'reset');
  assert.equal(authModeFromPath('/'), null);
  assert.equal(isAuthPath('/inscription'), true);
  assert.equal(isAuthPath('/app/cv'), false);
});
