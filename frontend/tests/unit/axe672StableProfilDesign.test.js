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

test('chaque champ du profil s’ouvre seul, sans mode Saisie ou Lecture', () => {
  assert.match(src, /InlineEdit/);
  assert.doesNotMatch(src, /profile-surface-switch/);
  assert.doesNotMatch(src, /profile_stable_surface/);
  const inline = readFileSync(new URL('../../src/components/profile/InlineEdit.jsx', import.meta.url), 'utf8');
  assert.match(inline, /HiPencil/);
  assert.match(inline, /profile-inline-input/);
  assert.doesNotMatch(inline, /setEditing/);
});

test('l’aperçu A4 tient dans la largeur de sa zone', () => {
  const css = readFileSync(new URL('../../src/styles/ProfileView.css', import.meta.url), 'utf8');
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1\.4fr\)\s*minmax\(220px,\s*0\.8fr\)/);
  assert.match(css, /transform:\s*scale\(calc\(100cqw\s*\/\s*210mm\)\)/);
  assert.match(src, /profile-preview-fit/);
});
