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
  assert.match(header, /ds-label-md/);
  assert.match(header, /size="sm"/);
  assert.match(header, /variant="secondary"/);
  assert.match(header, /variant="primary"/);
  assert.doesNotMatch(header, /btn-import-cv/);
  assert.doesNotMatch(src, /btn btn-import-cv/);
});

test('chaque champ du profil s’ouvre seul, sans mode Saisie ou Lecture', () => {
  assert.match(src, /InlineEdit/);
  assert.doesNotMatch(src, /profile-surface-switch/);
  assert.match(src, /profile-section-nav/);
  assert.match(src, /profileSection === 'identite'/);
  const inline = readFileSync(new URL('../../src/components/profile/InlineEdit.jsx', import.meta.url), 'utf8');
  assert.match(inline, /HiPencil/);
  assert.match(inline, /profile-inline-input/);
  assert.doesNotMatch(inline, /setEditing/);
});

test('l’aperçu A4 tient dans la largeur de sa zone', () => {
  const css = readFileSync(new URL('../../src/styles/ProfileView.css', import.meta.url), 'utf8');
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /--cv-preview-scale/);
  assert.match(css, /@supports \(width: calc\(1px \/ 1px\)\)/);
  assert.match(css, /transform:\s*scale\(calc\(100cqw\s*\/\s*210mm\)\)/);
  assert.match(src, /profile-preview-fit/);
});
