/**
 * AXE-488 : le premier paint de index.html partage les classes et les
 * couleurs d'action du design system, pas l'ancien bouton violet.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const INDEX = path.join(ROOT, 'index.html');
const TOKENS = path.join(ROOT, 'src/design/tokens.json');

const AUBERGINE = /#4a154b|#611f69|#481a54|#f9f0ff|#d9bdde|#592466|74,\s*21,\s*75|233,\s*216,\s*255/;

test('les CTA du shell index.html sont des ds-button', async () => {
  const html = await readFile(INDEX, 'utf8');
  assert.doesNotMatch(html, /class="[^"]*\bbutton button-primary\b/);
  assert.doesNotMatch(html, /class="[^"]*\bbutton button-secondary\b/);
  assert.match(html, /class="[^"]*\bds-button ds-button--primary ds-button--md\b/);
  assert.match(html, /class="[^"]*\bds-button ds-button--secondary ds-button--md\b/);
  assert.doesNotMatch(html, AUBERGINE);
});

test('la landing React ne garde pas le halo aubergine', async () => {
  const css = await readFile(path.join(ROOT, 'src/components/LandingPage.css'), 'utf8');
  assert.doesNotMatch(css, AUBERGINE);
});

test('le CSS critique des CTA ne cite que des hex déjà dans tokens.json', async () => {
  const html = await readFile(INDEX, 'utf8');
  const tokens = await readFile(TOKENS, 'utf8');
  const root = html.match(/:root\{[^}]+\}/);
  assert.ok(root, 'bloc :root absent');
  const decls = [...root[0].matchAll(/--ds-color-[a-z0-9-]+:(#[0-9a-fA-F]{3,8})/g)];
  assert.ok(decls.length >= 4, 'variables d’action absentes du CSS critique');
  for (const [, hex] of decls) {
    assert.match(tokens, new RegExp(hex, 'i'), `${hex} absent de tokens.json`);
  }
  assert.match(html, /--ds-color-action-primary-bg:#d63d0c/);
  assert.match(html, /\.ds-button--primary\{background:var\(--ds-color-action-primary-bg\)/);
});
