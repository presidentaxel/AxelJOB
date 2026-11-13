import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSentryReleaseName } from '../../src/lib/sentryReleaseName.js';

test('release explicite : VITE puis SENTRY, le SHA ne gagne pas', () => {
  assert.equal(
    resolveSentryReleaseName({ viteRelease: ' front-1 ', sentryRelease: 'back', gitSha: 'abc' }),
    'front-1',
  );
  assert.equal(
    resolveSentryReleaseName({ viteRelease: '', sentryRelease: ' back-2 ', gitSha: 'abc' }),
    'back-2',
  );
});

test('sans variable, le SHA git est la release partagée', () => {
  assert.equal(resolveSentryReleaseName({ gitSha: '5626159' }), '5626159');
});

test('rien du tout : pas de release, pour ne pas uploader dans le vide', () => {
  assert.equal(resolveSentryReleaseName({}), undefined);
  assert.equal(resolveSentryReleaseName({ viteRelease: '  ', gitSha: '' }), undefined);
});
