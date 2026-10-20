/**
 * AXE-469 : le CSS critique inline d'index.html et public/landing-static.css
 * sont générés depuis LandingPage.css (npm run landing:critical).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCriticalCss, START, END } from '../../scripts/sync-landing-critical-css.mjs';
import { landingMeta } from '../../src/content/landingCopy.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('index.html embarque le CSS critique à jour', async () => {
  const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const css = await buildCriticalCss();
  const inline = html.slice(html.indexOf(START) + START.length, html.indexOf(END)).trim();
  assert.equal(inline, css, 'lancer `npm run landing:critical`');
});

test('landing-static.css est la copie lisible du CSS critique', async () => {
  const css = await buildCriticalCss();
  const copy = await readFile(path.join(ROOT, 'public/landing-static.css'), 'utf8');
  assert.ok(copy.replace(/\s+/g, '').includes(css.replace(/\s+/g, '')));
});

test('les balises meta de index.html reprennent landingMeta (tutoiement)', async () => {
  const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes(`<title>${landingMeta.title}</title>`));
  assert.ok(html.includes(`name="description" content="${landingMeta.description}"`));
  assert.ok(html.includes(`property="og:title" content="${landingMeta.ogTitle}"`));
  assert.ok(html.includes(`property="og:description" content="${landingMeta.ogDescription}"`));
  assert.ok(html.includes(`name="twitter:title" content="${landingMeta.twitterTitle}"`));
  assert.ok(html.includes(`name="twitter:description" content="${landingMeta.twitterDescription}"`));
});

test('le CSS critique n’emploie que des variables --ds-* sémantiques hors :root', async () => {
  const css = await buildCriticalCss();
  const body = css.slice(css.indexOf('}') + 1);
  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(body, /var\(--ds-color-(neutral|orange|sun)-/);
});
