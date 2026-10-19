/**
 * AXE-469 : une seule barre de navigation sur toutes les pages publiques.
 * Source : src/content/publicHeader.js (balisage) + src/components/PublicHeader.css (style),
 * rendus par PublicHeader.jsx (React) et générés dans index.html et public/*.html
 * par scripts/sync-public-header.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { landingText } from '../../src/content/landingCopy.js';
import {
  PUBLIC_HEADER,
  PUBLIC_RESOURCE_LINKS,
  renderPublicHeaderHtml,
} from '../../src/content/publicHeader.js';
import { buildHeaderCss, pagePath, syncPage, targets } from '../../scripts/sync-public-header.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');

test('les 7 liens Ressources et les libellés viennent de landingCopy.js', () => {
  assert.deepEqual(
    PUBLIC_RESOURCE_LINKS.map((l) => l.to),
    ['/ats', '/faq', '/modeles-cv', '/guide-cv', '/erreurs-cv', '/cv-par-metier', '/cv-adapte-chaque-offre'],
  );
  assert.deepEqual(
    PUBLIC_RESOURCE_LINKS.map((l) => l.label),
    [
      landingText.footerAts,
      landingText.footerFaq,
      landingText.navModelesShort,
      landingText.navGuide,
      landingText.footerErreurs,
      landingText.footerMetier,
      landingText.footerAdapte,
    ],
  );
  assert.equal(PUBLIC_HEADER.pricing.label, landingText.navPricing);
  assert.equal(PUBLIC_HEADER.login.label, landingText.ctaLogin);
  assert.equal(PUBLIC_HEADER.cta.label, landingText.ctaTry);
});

test('index.html et toutes les pages HTML statiques portent la barre générée, à jour', async () => {
  for (const file of await targets()) {
    const source = await readFile(file, 'utf8');
    assert.equal(syncPage(source, file), source, `${path.basename(file)} périmé : npm run public-header:sync`);
    const expected = renderPublicHeaderHtml(pagePath(file));
    const flat = (text) => text.replace(/\r?\n\s*/g, '');
    assert.ok(flat(source).includes(flat(expected)), `${path.basename(file)} : barre différente de la source`);
  }
});

test('public/public-header.css est la copie générée de PublicHeader.css', async () => {
  const css = buildHeaderCss(await read('src/components/PublicHeader.css'));
  assert.equal((await read('public/public-header.css')).replace(/\r\n/g, '\n'), css);
});

test('toutes les pages statiques chargent le CSS et le script de la barre', async () => {
  const names = (await readdir(path.join(ROOT, 'public'))).filter((n) => n.endsWith('.html'));
  assert.ok(names.length >= 16);
  for (const name of names) {
    const html = await read(`public/${name}`);
    assert.match(html, /href="\/public-header\.css"/, name);
    assert.match(html, /src="\/public-header\.js" defer/, name);
    assert.doesNotMatch(html, /content-header|content-burger|content-nav/, name);
  }
  const index = await read('index.html');
  assert.match(index, /src="\/public-header\.js" defer/);
  assert.doesNotMatch(index, /landing-header|landing-burger|landing-mobile|landing-nav/);
});

test('un seul bloc de CSS pour la barre : plus de copie dans la landing ni les pages de contenu', async () => {
  for (const rel of ['src/components/LandingPage.css', 'public/static-pages.css']) {
    const css = await read(rel);
    assert.doesNotMatch(css, /\.(?:landing|content)-(?:header|nav|burger|menu)\b/, rel);
  }
  for (const rel of ['src/components/LandingPage.jsx', 'src/components/ContentChrome.jsx']) {
    const src = await read(rel);
    assert.match(src, /PublicHeader/, rel);
    assert.doesNotMatch(src, /landing-header|content-header|content-burger/, rel);
  }
});

test('le style de la barre : 60 px, flou, 15 px, panneau défilant, aucun hex', async () => {
  const css = await read('src/components/PublicHeader.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(css, /height: var\(--ds-layout-nav-height\)/);
  assert.match(css, /color-mix\(in srgb, var\(--ds-color-bg-subtle\) 92%, transparent\)/);
  assert.match(css, /backdrop-filter: blur\(12px\)/);
  assert.match(css, /font-size: var\(--ds-font-size-body-sm\)/);
  assert.match(css, /max-height: calc\(100dvh - var\(--ds-layout-nav-height\)\)/);
  assert.match(css, /overflow-y: auto/);
  assert.match(css, /--ds-font-family-display/);
});

test('React et script statique gèrent Échap, clic extérieur, aria-expanded et le retour desktop', async () => {
  const react = await read('src/components/PublicHeader.jsx');
  const script = await read('public/public-header.js');
  for (const src of [react, script]) {
    assert.match(src, /Escape/);
    assert.match(src, /pointerdown/);
    assert.match(src, /aria-expanded/);
    assert.match(src, /focus\(\)/);
    assert.match(src, /matchMedia/);
  }
  assert.match(react, /aria-expanded=\{panelOpen\}/);
  assert.match(script, /data-public-header="static"/);
  assert.match(react, /data-public-header="react"/);
});

const SUBNAV_PAGES = PUBLIC_RESOURCE_LINKS.map((l) => l.to);

test('barre secondaire Ressources : 7 onglets, aria-current sur la page courante, absente ailleurs', async () => {
  for (const file of await targets()) {
    const source = await readFile(file, 'utf8');
    const page = pagePath(file);
    const subnav = source.match(/<nav class="resources-subnav"[\s\S]*?<\/nav>/);
    if (!SUBNAV_PAGES.includes(page)) {
      assert.equal(subnav, null, `${page} : pas de barre secondaire`);
      continue;
    }
    assert.ok(subnav, `${page} : barre secondaire`);
    const links = [...subnav[0].matchAll(/<a href="([^"]+)"( aria-current="page")?[^>]*>([^<]+)<\/a>/g)];
    assert.deepEqual(links.map((m) => m[1]), SUBNAV_PAGES);
    assert.deepEqual(links.map((m) => m[3]), PUBLIC_RESOURCE_LINKS.map((l) => l.label));
    assert.deepEqual(links.filter((m) => m[2]).map((m) => m[1]), [page]);
    // La navbar principale garde « Ressources » actif et son menu complet.
    assert.match(source, /public-header-menu-toggle is-current/);
    assert.equal((source.match(/class="public-header-menu-list"[\s\S]*?<\/ul>/)[0].match(/<li>/g) || []).length, 7);
    // Barre secondaire hors de <header> (collante sous lui), dans le bloc généré.
    assert.ok(source.indexOf('</header>') < source.indexOf('resources-subnav'));
    assert.ok(source.indexOf('resources-subnav') < source.indexOf('PUBLIC-HEADER:END'));
  }
  for (const page of ['/', '/404', '/500', '/cgu', '/mentions-legales', '/confidentialite']) {
    assert.doesNotMatch(renderPublicHeaderHtml(page), /resources-subnav/, page);
  }
});

test('barre secondaire : 44 px collée sous la navbar, scroll-margin des ancres, composant React partagé', async () => {
  const css = await read('src/components/PublicHeader.css');
  assert.match(css, /--public-header-subnav-height: 44px;/);
  assert.match(css, /\.resources-subnav \{[^}]*position: sticky;[^}]*top: var\(--ds-layout-nav-height\);/);
  assert.match(css, /overflow-x: auto;/);
  assert.match(css, /scrollbar-width: none;/);
  assert.match(css, /scroll-snap-type: x proximity;/);
  assert.match(css, /mask-image: linear-gradient/);
  assert.match(css, /\.resources-subnav a\[aria-current='page'\]::after \{[^}]*height: 2px;[^}]*background: var\(--ds-color-accent-brand\);/);
  assert.match(css, /\.resources-subnav a:focus-visible/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(await read('public/static-pages.css'), /scroll-margin-top: calc\(var\(--ds-layout-nav-height\) \+ var\(--public-header-subnav-height, 0px\)/);
  assert.match(await read('src/components/ContentChrome.jsx'), /<ResourcesSubnav \/>/);
  const jsx = await read('src/components/ResourcesSubnav.jsx');
  assert.match(jsx, /PUBLIC_RESOURCE_LINKS/);
  assert.match(jsx, /isResourcePath\(current\)/);
  assert.match(await read('public/public-header.js'), /data-resources-subnav/);
});
