/**
 * AXE-672 — le profil Stable n'utilise plus le bouton legacy.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const src = readFileSync(new URL('../../src/components/ProfileView.jsx', import.meta.url), 'utf8');

test('l’en-tête Stable utilise Button et les rôles typo', () => {
  const start = src.indexOf('className="profile-header"');
  const header = src.slice(start, start + 1400);
  assert.match(header, /ds-heading-md/);
  assert.match(header, /variant="secondary"/);
  assert.match(header, /variant="primary"/);
  assert.doesNotMatch(header, /btn-import-cv/);
  assert.doesNotMatch(src, /btn btn-import-cv/);
});

test('le profil Stable bascule entre Saisie et Lecture', () => {
  assert.match(src, /Saisie/);
  assert.match(src, /Lecture/);
  assert.match(src, /profile-view--lecture/);
  assert.match(src, /hidden=\{surface === 'lecture'\}/);
});
