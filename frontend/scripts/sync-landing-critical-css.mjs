/**
 * Génère le CSS critique de la landing à partir des vrais fichiers CSS :
 *   - styles/ds-tokens.generated.css (seules les variables --ds-* utilisées) ;
 *   - styles/app/buttons.css, styles/ds-typography.css ;
 *   - components/PublicHeader.css (barre de navigation unique, voir scripts/sync-public-header.mjs) ;
 *   - components/LandingPage.css ;
 *   - le reset minimal du shell (SHELL_BASE).
 *
 * Résultat écrit dans index.html (deuxième balise <style>, entre les marqueurs
 * LANDING-CRITICAL-CSS) et dans public/landing-static.css (non minifié par ligne).
 * `--check` échoue si l'un des deux est périmé (utilisé par le test unitaire).
 *
 * Usage : node scripts/sync-landing-critical-css.mjs [--check]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const INDEX = join(ROOT, 'index.html');
const STATIC_CSS = join(ROOT, 'public', 'landing-static.css');

export const START = '/* LANDING-CRITICAL-CSS:START (généré par scripts/sync-landing-critical-css.mjs) */';
export const END = '/* LANDING-CRITICAL-CSS:END */';

/** Fond de page, reset et variables courtes du shell (tout vient des tokens). */
const SHELL_BASE = `
html { background: var(--ds-color-bg-default); scrollbar-width: thin; }
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: var(--ds-font-family-body);
  background: var(--bg);
  color: var(--text);
}
img { max-width: 100%; }
`;

const ROOT_ALIASES = `
--bg: var(--ds-color-bg-default);
--bg-page: var(--ds-color-bg-subtle);
--text: var(--ds-color-text-default);
--text-secondary: var(--ds-color-text-muted);
`;

export function minify(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/:\s+/g, ':')
    .replace(/;}/g, '}')
    .trim();
}

function declarations(generated) {
  const map = new Map();
  for (const m of generated.matchAll(/(--ds-[a-z0-9-]+):\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}

export async function buildCriticalCss() {
  const [generated, buttons, typography, header, landing] = await Promise.all([
    readFile(join(SRC, 'styles/ds-tokens.generated.css'), 'utf8'),
    readFile(join(SRC, 'styles/app/buttons.css'), 'utf8'),
    readFile(join(SRC, 'styles/ds-typography.css'), 'utf8'),
    readFile(join(SRC, 'components/PublicHeader.css'), 'utf8'),
    readFile(join(SRC, 'components/LandingPage.css'), 'utf8'),
  ]);
  const body = [SHELL_BASE, buttons, typography, header, landing].join('\n');
  const all = declarations(generated);
  const used = new Set();
  for (const m of body.matchAll(/var\((--ds-[a-z0-9-]+)/g)) used.add(m[1]);
  for (const m of ROOT_ALIASES.matchAll(/var\((--ds-[a-z0-9-]+)/g)) used.add(m[1]);
  const missing = [...used].filter((name) => !all.has(name));
  if (missing.length) throw new Error(`Variables absentes de ds-tokens.generated.css : ${missing.join(', ')}`);
  const vars = [...all.keys()].filter((name) => used.has(name)).map((name) => `${name}:${all.get(name)}`);
  const root = `:root{${vars.join(';')};${minify(ROOT_ALIASES)}}`;
  return `${root}\n${minify(body)}`;
}

async function main() {
  const check = process.argv.includes('--check');
  const css = await buildCriticalCss();
  const html = await readFile(INDEX, 'utf8');
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < start) throw new Error('Marqueurs LANDING-CRITICAL-CSS absents de index.html');
  const nextHtml = `${html.slice(0, start + START.length)}\n${css}\n${html.slice(end)}`;
  const header = `/*\n * Copie lisible du CSS critique inline de index.html.\n * Généré par scripts/sync-landing-critical-css.mjs : ne pas modifier à la main.\n */\n`;
  const nextStatic = `${header}${css.replace(/\}/g, '}\n')}\n`;
  const currentStatic = await readFile(STATIC_CSS, 'utf8').catch(() => '');
  if (check) {
    if (nextHtml !== html || nextStatic !== currentStatic) {
      console.error('CSS critique périmé : lancer `npm run landing:critical`.');
      process.exit(1);
    }
    return;
  }
  await writeFile(INDEX, nextHtml);
  await writeFile(STATIC_CSS, nextStatic);
  console.log(`CSS critique écrit (${css.length} caractères).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
