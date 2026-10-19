/**
 * AXE-488 : les textes de l'accueil React et du HTML statique viennent
 * de landingCopy.js. Un écart fait échouer ce test.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { landingCopyright, sharedLandingStrings } from '../../src/content/landingCopy.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function norm(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function staticLines(html) {
  const start = html.indexOf('<div class="static-crawlable landing">');
  const end = html.indexOf('</footer>', start);
  assert.ok(start >= 0 && end > start, 'bloc statique introuvable');
  const block = html
    .slice(start, end)
    .replace(/<span data-year>(\d{4})<\/span>/g, '$1')
    .replace(/<[^>]+>/g, '\n');
  return block
    .split('\n')
    .map(norm)
    .filter((line) => line && line !== '|' && line !== '.');
}

test('LandingPage lit les textes dans landingCopy', async () => {
  const jsx = await readFile(path.join(ROOT, 'src/components/LandingPage.jsx'), 'utf8');
  assert.match(jsx, /from '\.\.\/content\/landingCopy\.js'/);
  assert.doesNotMatch(jsx, /Passe les filtres automatiques/);
  assert.doesNotMatch(jsx, /Prêt à décrocher le job/);
});

test('le HTML statique et landingCopy disent la même chose', async () => {
  const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const lines = staticLines(html);
  const shared = [...new Set(sharedLandingStrings().map(norm))];
  const year = new Date().getFullYear();
  const copyright = norm(landingCopyright(year));
  const yearless = (line) => line.replace(/^© \d{4} /, '© ');
  const blob = norm(lines.join('\n'));

  for (const sentence of shared) {
    assert.ok(blob.includes(sentence), `texte absent du HTML statique : ${sentence}`);
  }

  const known = new Set(shared);
  for (const line of lines) {
    if (yearless(line) === yearless(copyright)) continue;
    assert.ok(known.has(line), `texte du HTML statique absent de landingCopy : ${line}`);
  }
  // L'année du HTML source est remplacée au chargement par un petit script.
  assert.ok(
    lines.some((line) => yearless(line) === yearless(copyright)),
    `pied de page attendu : ${copyright}`,
  );
  assert.match(html, /data-landing-copyright/);
  assert.match(html, /<span data-year>\d{4}<\/span>/);
  assert.match(html, /<script src="\/footer-year\.js" defer><\/script>/);
  assert.doesNotMatch(html, /Adaptez votre|Améliorez votre|suivez vos/);
});
