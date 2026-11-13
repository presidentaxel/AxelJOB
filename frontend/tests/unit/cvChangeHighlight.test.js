import assert from 'node:assert/strict';
import test from 'node:test';

import { diffHighlightHtml, diffHighlightParts } from '../../src/lib/cvChangeHighlight.js';

test('le préfixe inchangé ne passe pas en vert', () => {
  const parts = diffHighlightParts(
    'Étudiant ESSEC – Entrepreneuriat',
    'Étudiant ESSEC - Président de la République',
  );
  const unchanged = parts.filter((part) => !part.changed).map((part) => part.text).join(' ');
  const changed = parts.filter((part) => part.changed).map((part) => part.text).join(' ');
  assert.match(unchanged, /Étudiant ESSEC/);
  assert.match(changed, /Président de la République/);
  assert.doesNotMatch(changed, /Étudiant/);
});

test('le HTML ne colore que les mots nouveaux', () => {
  const html = diffHighlightHtml('Alternant ESSEC', 'Alternant ESSEC Président');
  assert.match(html, /^Alternant ESSEC <span class="cv-changed">Président<\/span>$/);
});
