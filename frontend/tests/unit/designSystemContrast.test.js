/**
 * AXE-468 : les paires texte/fond et UI/fond du design system respectent WCAG AA
 * (4,5:1 pour le texte, 3:1 pour les éléments d'interface). Valeurs résolues
 * depuis tokens.json, donc un changement de palette qui casse le contraste échoue ici.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokenTree, resolveValue } from '../../scripts/build-tokens.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const tree = loadTokenTree(await readFile(path.join(ROOT, 'src/design/tokens.json'), 'utf8'));
const color = (token) => resolveValue(tree, `{color.${token}}`);

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_SURFACES = ['bg.default', 'bg.subtle', 'bg.subtle-deep', 'bg.accent'];
const DARK_SURFACES = ['bg.inverse', 'bg.inverse-raised'];

const TEXT_ON_LIGHT = ['text.default', 'text.muted', 'text.subtle', 'text.link', 'text.danger', 'action.link.fg'];
const TEXT_ON_DARK = ['text.inverse', 'text.inverse-muted', 'text.inverse-subtle'];

for (const fg of TEXT_ON_LIGHT) {
  for (const bg of LIGHT_SURFACES) {
    test(`${fg} sur ${bg} ≥ 4,5:1`, () => {
      const r = ratio(color(fg), color(bg));
      assert.ok(r >= 4.5, `${fg} sur ${bg} = ${r.toFixed(2)}:1`);
    });
  }
}

for (const fg of TEXT_ON_DARK) {
  for (const bg of DARK_SURFACES) {
    test(`${fg} sur ${bg} ≥ 4,5:1`, () => {
      const r = ratio(color(fg), color(bg));
      assert.ok(r >= 4.5, `${fg} sur ${bg} = ${r.toFixed(2)}:1`);
    });
  }
}

test('boutons : texte sur fond, états repos / hover / active ≥ 4,5:1', () => {
  for (const state of ['bg', 'bg-hover', 'bg-active']) {
    const r = ratio(color('action.primary.fg'), color(`action.primary.${state}`));
    assert.ok(r >= 4.5, `primary ${state} = ${r.toFixed(2)}:1`);
  }
  for (const state of ['bg', 'bg-hover', 'bg-active']) {
    const r = ratio(color('action.secondary.fg'), resolveOrWhite(`action.secondary.${state}`));
    assert.ok(r >= 4.5, `secondary ${state} = ${r.toFixed(2)}:1`);
  }
});

function resolveOrWhite(token) {
  const value = color(token);
  return value.startsWith('#') ? value : '#ffffff';
}

test('éléments d’interface (bordure de champ, focus) ≥ 3:1 sur les fonds clairs', () => {
  for (const token of ['border.input', 'border.focus', 'border.input-focus']) {
    for (const bg of ['bg.default', 'bg.subtle']) {
      const r = ratio(color(token), color(bg));
      assert.ok(r >= 3, `${token} sur ${bg} = ${r.toFixed(2)}:1`);
    }
  }
});

test('l’orange de marque n’est jamais un fond de bouton avec texte blanc', () => {
  const brand = color('accent.brand');
  assert.notEqual(color('action.primary.bg').toLowerCase(), brand.toLowerCase());
  assert.ok(ratio('#ffffff', brand) < 4.5, 'garde-fou : si la marque passe AA, retirer cette règle');
});

test("l'orange d'action (orange.600) reste lisible en texte sur les fonds clairs et teintés", () => {
  const orange = color('orange.600');
  for (const bg of ['bg.default', 'bg.subtle', 'bg.accent', 'accent.highlight']) {
    const r = ratio(orange, color(bg));
    assert.ok(r >= 4.5, `orange.600 sur ${bg} = ${r.toFixed(2)}:1`);
  }
});

