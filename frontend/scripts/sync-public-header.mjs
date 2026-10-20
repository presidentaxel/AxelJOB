/**
 * Barre de navigation unique des pages publiques (AXE-469) : génère, depuis la même source que
 * le composant React (src/content/publicHeader.js + src/components/PublicHeader.css) :
 *   - le balisage de la barre dans index.html et dans chaque HTML statique de public/
 *     (entre les marqueurs PUBLIC-HEADER:START / PUBLIC-HEADER:END) ;
 *   - public/public-header.css, copie du CSS de la barre pour les pages statiques
 *     (index.html l'embarque dans son CSS critique : voir sync-landing-critical-css.mjs) ;
 *   - la balise <link> vers ce CSS et la balise <script> du comportement (public/public-header.js).
 *
 * `--check` échoue si l'un de ces fichiers est périmé (utilisé par tests/unit/publicHeaderSync.test.js).
 *
 * Usage : node scripts/sync-public-header.mjs [--check]
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPublicHeaderHtml } from '../src/content/publicHeader.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const INDEX = join(ROOT, 'index.html');
const SOURCE_CSS = join(ROOT, 'src', 'components', 'PublicHeader.css');
const OUT_CSS = join(PUBLIC_DIR, 'public-header.css');

export const START = '<!-- PUBLIC-HEADER:START (généré par scripts/sync-public-header.mjs, source : src/content/publicHeader.js) -->';
export const END = '<!-- PUBLIC-HEADER:END -->';
const LINK_TAG = '<link rel="stylesheet" href="/public-header.css" />';
const SCRIPT_TAG = '<script src="/public-header.js" defer></script>';
const MARKED = /^([ \t]*)<!-- PUBLIC-HEADER:START[^\n]*-->[\s\S]*?<!-- PUBLIC-HEADER:END -->/m;
const LEGACY = /^([ \t]*)<header class="(?:content-header|landing-header)">[\s\S]*?<\/header>/m;

/** Chemin public d'une page : index.html -> '/', ats.html -> '/ats'. */
export function pagePath(file) {
  const name = basename(file, '.html');
  return file === INDEX || name === 'index' ? '/' : `/${name}`;
}

export function buildHeaderCss(sourceCss) {
  const banner = '/*\n * Barre de navigation des pages publiques (copie de src/components/PublicHeader.css).\n * Généré par scripts/sync-public-header.mjs : ne pas modifier à la main.\n */\n';
  return `${banner}${sourceCss.replace(/\r\n/g, '\n')}`;
}

/** Renvoie le HTML d'une page avec barre, lien CSS et script à jour. */
export function syncPage(source, file) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  let html = source.replace(/\r\n/g, '\n');
  const wrap = (indent) =>
    `${indent}${START}\n${renderPublicHeaderHtml(pagePath(file), indent)}\n${indent}${END}`;
  if (MARKED.test(html)) html = html.replace(MARKED, (_m, indent) => wrap(indent));
  else if (LEGACY.test(html)) html = html.replace(LEGACY, (_m, indent) => wrap(indent));
  else throw new Error(`${file} : aucune barre de navigation à remplacer`);

  const isIndex = file === INDEX;
  if (!isIndex && !html.includes(LINK_TAG)) {
    const m = html.match(/^([ \t]*)<link rel="stylesheet" href="\/static-pages\.css" \/>$/m);
    if (!m) throw new Error(`${file} : static-pages.css introuvable`);
    html = html.replace(m[0], `${m[0]}\n${m[1]}${LINK_TAG}`);
  }
  if (!html.includes(SCRIPT_TAG)) {
    html = html.replace(/^([ \t]*)<\/body>/m, (_m, indent) => `${indent}${SCRIPT_TAG}\n${indent}</body>`);
    if (!html.includes(SCRIPT_TAG)) throw new Error(`${file} : </body> introuvable`);
  }
  return html.replace(/\n/g, eol);
}

export async function targets() {
  const names = (await readdir(PUBLIC_DIR)).filter((n) => n.endsWith('.html')).sort();
  return [INDEX, ...names.map((n) => join(PUBLIC_DIR, n))];
}

async function main() {
  const check = process.argv.includes('--check');
  const stale = [];
  const css = buildHeaderCss(await readFile(SOURCE_CSS, 'utf8'));
  const currentCss = await readFile(OUT_CSS, 'utf8').catch(() => '');
  if (currentCss !== css) {
    stale.push(OUT_CSS);
    if (!check) await writeFile(OUT_CSS, css);
  }
  for (const file of await targets()) {
    const source = await readFile(file, 'utf8');
    const next = syncPage(source, file);
    if (next !== source) {
      stale.push(file);
      if (!check) await writeFile(file, next);
    }
  }
  if (check && stale.length) {
    console.error(`Barre de navigation périmée : lancer \`npm run public-header:sync\`.\n${stale.join('\n')}`);
    process.exit(1);
  }
  if (!check) console.log(`Barre de navigation synchronisée (${stale.length} fichier(s) modifié(s)).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
