import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** IDs home-* + nav-* posés en miroir React / HTML (AXE-359). */
const SHARED_IDS = [
  'home-hero-title',
  'home-hero-cta-signup',
  'home-pricing-card-free',
  'home-pricing-cta-free',
  'home-pricing-card-pro',
  'home-pricing-badge-popular',
  'home-pricing-cta-pro',
  'home-why-link-ats',
  'home-final-cta-signup',
];

/**
 * Barre de navigation : ids définis dans src/content/publicHeader.js, rendus à l'identique par
 * PublicHeader.jsx (React) et par le HTML statique généré (voir aussi publicHeader.test.js).
 */
const NAV_IDS = [
  'nav-link-back',
  'nav-link-pricing',
  'nav-menu-resources',
  'nav-link-ats',
  'nav-link-faq',
  'nav-link-modeles',
  'nav-link-guide',
  'nav-link-erreurs',
  'nav-link-metier',
  'nav-link-adapte',
  'nav-link-login',
  'nav-cta-signup',
  'nav-burger',
  'nav-drawer-pricing',
  'nav-drawer-ats',
  'nav-drawer-login',
  'nav-cta-drawer',
];

const SECTIONS = ['hero', 'how', 'pricing', 'features', 'why', 'final'];

function unique(ids) {
  const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
  return dups;
}

function idsFromHtml(text) {
  return [...text.matchAll(/\bdata-attr="([a-z0-9-]+)"/g)].map((m) => m[1]);
}

function idsFromJsx(text) {
  return [...text.matchAll(/analyticsAttrs\('([a-z0-9-]+)'/g)].map((m) => m[1]);
}

function sectionsFrom(text) {
  return [...text.matchAll(/\bdata-section="([a-z-]+)"/g)].map((m) => m[1]);
}

test('landing React et HTML statique portent les data-attr AXE-359 en miroir', async () => {
  const jsx = await readFile(path.join(FRONTEND_ROOT, 'src/components/LandingPage.jsx'), 'utf8');
  const html = await readFile(path.join(FRONTEND_ROOT, 'index.html'), 'utf8');
  const css = await readFile(path.join(FRONTEND_ROOT, 'src/components/LandingPage.css'), 'utf8');

  const jsxIds = idsFromJsx(jsx);
  const htmlIds = idsFromHtml(html);

  assert.deepEqual(unique(jsxIds), [], `doublons React: ${unique(jsxIds)}`);
  assert.deepEqual(unique(htmlIds), [], `doublons HTML: ${unique(htmlIds)}`);

  for (const id of SHARED_IDS) {
    assert.ok(jsxIds.includes(id), `manque React: ${id}`);
    assert.ok(htmlIds.includes(id), `manque HTML: ${id}`);
  }
  const headerData = await readFile(path.join(FRONTEND_ROOT, 'src/content/publicHeader.js'), 'utf8');
  for (const id of NAV_IDS) {
    assert.ok(headerData.includes(`'${id}'`), `manque dans publicHeader.js: ${id}`);
    assert.ok(htmlIds.includes(id), `manque HTML: ${id}`);
  }
  assert.match(jsx, /<PublicHeader \/>/);
  assert.equal(jsxIds.includes('nav-logo'), false);

  const footerIds = [
    'footer-link-ats',
    'footer-link-faq',
    'footer-link-modeles',
    'footer-link-guide',
    'footer-link-erreurs',
    'footer-link-metier',
    'footer-link-adapte',
    'footer-link-mentions',
    'footer-link-confidentialite',
    'footer-link-cgu',
    'footer-link-axelproject',
  ];
  for (const id of footerIds) {
    assert.ok(jsxIds.includes(id), `manque footer React: ${id}`);
    assert.ok(htmlIds.includes(id), `manque footer HTML: ${id}`);
  }
  assert.ok(jsxIds.includes('footer-link-support'), 'Support tagué en React (mailto HTML non modifié : secret scan)');

  for (const section of SECTIONS) {
    assert.ok(sectionsFrom(jsx).includes(section), `data-section React: ${section}`);
    assert.ok(sectionsFrom(html).includes(section), `data-section HTML: ${section}`);
  }

  assert.equal(css.includes('data-attr'), false, 'pas de data-attr dans le CSS landing');
});
