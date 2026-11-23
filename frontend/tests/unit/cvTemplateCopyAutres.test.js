/** AXE-1025 : titre personnalisé de la section « Autres ». */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cvTemplateCopy, AUTRES_TITRE_MAX } from '../../src/lib/cvTemplateCopy.js';

test('sans titre personnalisé : Autres / Other', () => {
  assert.equal(cvTemplateCopy('fr').other_title, 'Autres');
  assert.equal(cvTemplateCopy('en', '   ').other_title, 'Other');
});

test('titre personnalisé : casse naturelle et capitales', () => {
  const st = cvTemplateCopy('fr', ' Centres d’intérêt ');
  assert.equal(st.other_title, 'Centres d’intérêt');
  assert.equal(st.other, 'CENTRES D’INTÉRÊT');
  assert.equal(cvTemplateCopy('fr').other_title, 'Autres', 'la copie par défaut n’est pas modifiée');
});

test('titre tronqué à la limite', () => {
  assert.equal(cvTemplateCopy('fr', 'x'.repeat(100)).other_title.length, AUTRES_TITRE_MAX);
});
