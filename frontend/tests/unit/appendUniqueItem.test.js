/** AXE-1021 : Entrée dans « Logiciels & outils » ajoute un élément, sans vide ni doublon. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appendUniqueItem } from '../../src/lib/appendUniqueItem.js';

test('ajoute la valeur nettoyée', () => {
  assert.deepEqual(appendUniqueItem(['Excel'], '  Git '), ['Excel', 'Git']);
});

test('champ vide : rien n’est créé', () => {
  const list = ['Excel'];
  assert.equal(appendUniqueItem(list, '   '), list);
});

test('doublon (casse ignorée) : rien n’est ajouté', () => {
  const list = ['Excel', 'React'];
  assert.equal(appendUniqueItem(list, 'excel'), list);
});

test('liste absente', () => {
  assert.deepEqual(appendUniqueItem(undefined, 'Figma'), ['Figma']);
});
