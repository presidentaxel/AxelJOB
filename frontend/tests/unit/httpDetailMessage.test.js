import { test } from 'node:test';
import assert from 'node:assert/strict';

import { httpDetailMessage } from '../../src/lib/httpDetailMessage.js';

test('un detail objet expose le message, pas la reason brute', () => {
  const msg = httpDetailMessage({
    message: "Erreur Gemini lors de l'import.",
    reason: 'billing_prepay',
  });
  assert.equal(msg, "Erreur Gemini lors de l'import.");
});

test('une chaine FastAPI reste telle quelle', () => {
  assert.equal(httpDetailMessage('Quota temporairement atteint.'), 'Quota temporairement atteint.');
});
