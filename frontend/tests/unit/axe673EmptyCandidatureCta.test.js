/**
 * AXE-673 — l'état vide des candidatures envoie vers l'espace CV.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSrc = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

test('candidatures-empty-cta-start navigue vers /app/cv', () => {
  const marker = 'data-attr="candidatures-empty-cta-start"';
  const at = appSrc.indexOf(marker);
  assert.ok(at > 0, 'CTA introuvable');
  const around = appSrc.slice(at - 280, at + marker.length);
  assert.match(around, /navigate\('\/app\/cv'\)/);
  assert.doesNotMatch(around, /setSetupModalOpen/);
});
