/**
 * AXE-469 : finitions des pages publiques (copyright dynamique, kicker + mot surligné, typographie
 * française, cibles tactiles du pied de page, FAQ de la landing, page 404).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FAQ_ITEMS, LANDING_FAQ_ITEMS, faqStrings } from '../../src/content/faqItems.js';
import { landingText, BENEFITS, STEPS, FEATURES } from '../../src/content/landingCopy.js';

import { visibleText } from './helpers/htmlText.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const PUBLIC_HTML = readdirSync(path.join(ROOT, 'public')).filter((f) => f.endsWith('.html'));
const SEO_PAGES = {
  ats: landingText.footerAts,
  faq: landingText.footerFaq,
  'modeles-cv': landingText.footerModeles,
  'guide-cv': landingText.footerGuide,
  'erreurs-cv': landingText.footerErreurs,
  'cv-par-metier': landingText.footerMetier,
  'cv-adapte-chaque-offre': landingText.footerAdapte,
};

const SPACE_BEFORE = /[^\s] [?!:;»]/;

test('aucun « © 20xx » en dur : l’année est un <span data-year> mis à jour par footer-year.js', () => {
  const files = ['index.html', ...PUBLIC_HTML.map((f) => `public/${f}`)];
  let seen = 0;
  for (const rel of files) {
    const src = read(rel);
    assert.doesNotMatch(src, /©\s*20\d\d/, `${rel}: année en dur`);
    for (const m of src.matchAll(/©/g)) {
      seen += 1;
      assert.match(src.slice(m.index, m.index + 40), /^© <span data-year>20\d\d<\/span> /, `${rel}: repli attendu`);
    }
    if (src.includes('data-year')) assert.match(src, /<script src="\/footer-year\.js" defer><\/script>/, `${rel}: footer-year.js`);
  }
  assert.ok(seen >= 13, 'pieds de page trouvés');
});

test('footer-year.js écrit l’année courante dans chaque [data-year]', () => {
  const nodes = [{ textContent: '2020' }, { textContent: '1999' }];
  vm.runInNewContext(read('public/footer-year.js'), { document: { querySelectorAll: () => nodes }, Date, String });
  for (const node of nodes) assert.equal(node.textContent, String(new Date().getFullYear()));
});

test('pages de contenu : kicker avant le H1, un seul mot surligné, surlignage défini une fois dans static-pages.css', () => {
  for (const [slug, label] of Object.entries(SEO_PAGES)) {
    const src = read(`public/${slug}.html`);
    const m = src.match(/<p class="content-kicker">([^<]+)<\/p>\s*<h1>([\s\S]*?)<\/h1>/);
    assert.ok(m, `${slug}: kicker + h1`);
    assert.equal(m[1], label, `${slug}: libellé du kicker`);
    assert.equal((m[2].match(/<em class="ds-highlight">[^<]+<\/em>/g) || []).length, 1, `${slug}: un mot surligné`);
  }
  const css = read('public/static-pages.css');
  assert.equal((css.match(/^\.ds-highlight\s*\{/gm) || []).length, 1);
  assert.match(css, /^\.content-kicker,/m);
});

test('composants React des pages de contenu : même kicker et même mot surligné que le HTML statique', () => {
  const chrome = read('src/components/ContentChrome.jsx');
  assert.match(chrome, /export function ContentHeroTitle/);
  assert.match(chrome, /<em className="ds-highlight">\{highlight\}<\/em>/);
  assert.match(read('src/components/AtsPage.jsx'), /kicker=\{landingText\.footerAts\} title="Qu'est-ce qu'un ATS \?" highlight="ATS"/);
  assert.match(read('src/components/FaqPage.jsx'), /kicker=\{landingText\.footerFaq\} title="FAQ : CV, ATS et IA" highlight="IA"/);
  const articles = read('src/components/ArticlesPages.jsx');
  for (const [slug, key, word] of [
    ['modeles-cv', 'footerModeles', 'bon'],
    ['guide-cv', 'footerGuide', 'bon'],
    ['erreurs-cv', 'footerErreurs', 'fréquentes'],
    ['cv-par-metier', 'footerMetier', 'secteur'],
    ['cv-adapte-chaque-offre', 'footerAdapte', 'adapté'],
  ]) {
    assert.ok(articles.includes(`kicker: landingText.${key},`), `${slug}: kicker React`);
    assert.ok(articles.includes(`highlight: '${word}',`), `${slug}: mot surligné React`);
    assert.match(read(`public/${slug}.html`), new RegExp(`<em class="ds-highlight">${word}</em>`), `${slug}: mot surligné statique`);
  }
});

test('typographie française : jamais d’espace normale avant ? ! : ; » ni après « (HTML statique des 7 pages et de la landing)', () => {
  for (const rel of [...Object.keys(SEO_PAGES).map((s) => `public/${s}.html`), 'index.html']) {
    // Le H1 garde son texte d'origine (SEO) : il est exclu de ce contrôle.
    const text = visibleText(read(rel));
    assert.doesNotMatch(text, SPACE_BEFORE, `${rel}: ${text.match(/.{0,30}[^\s] [?!:;»].{0,10}/)?.[0]}`);
    assert.doesNotMatch(text, /« /, `${rel}: « suivi d'une espace normale`);
  }
});

test('typographie française : textes JS (landingCopy, faqItems) et JSX des pages de contenu', () => {
  const strings = [
    ...Object.values(landingText),
    ...[STEPS, FEATURES, BENEFITS].flatMap((rows) => rows.flatMap((r) => [r.title, r.desc])),
    ...faqStrings(FAQ_ITEMS),
  ];
  for (const s of strings) assert.doesNotMatch(s, SPACE_BEFORE, s);
  for (const f of ['AtsPage', 'FaqPage', 'ArticlesPages']) {
    const lines = read(`src/components/${f}.jsx`).split('\n');
    lines.forEach((line, i) => {
      if (/<h1>|ContentHeroTitle|title: |title=|\bconst\b|=>| \? '| \? <| \? document|\?\./.test(line)) return;
      if (/\bclassName=\{|`content-section/.test(line)) return;
      assert.doesNotMatch(line, /[\p{L}\p{N}] [?!;»]/u, `${f}.jsx:${i + 1}: ${line.trim().slice(0, 80)}`);
      assert.doesNotMatch(line, /[\p{L}\p{N}] :(?!\S)/u, `${f}.jsx:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
});

test('pied de page : liens à ≥ 24 px de haut (padding vertical) sur la landing et les pages de contenu', () => {
  const content = read('public/static-pages.css');
  assert.match(content, /\.content-footer-col a \{\s*display: inline-block;\s*padding: var\(--ds-space-xs\) 0;/);
  assert.match(content, /\.content-footer-legal a \{\s*display: inline-block;\s*padding: var\(--ds-space-xs\) 0;/);
  const landing = read('src/components/LandingPage.css');
  assert.match(landing, /\.landing-footer-list a \{\s*display: inline-block;\s*padding: var\(--ds-space-xs\) 0;/);
  assert.match(landing, /\.landing-footer-legal a \{\s*display: inline-block;\s*padding: var\(--ds-space-xs\) 0;/);
});

test('FAQ : questions et réponses de /faq et de la landing viennent de faqItems.js', () => {
  assert.match(read('src/components/FaqPage.jsx'), /from '\.\.\/content\/faqItems\.js'/);
  assert.match(read('src/components/LandingPage.jsx'), /LANDING_FAQ_ITEMS/);
  assert.equal(LANDING_FAQ_ITEMS.length >= 4 && LANDING_FAQ_ITEMS.length <= 5, true);
  assert.ok(LANDING_FAQ_ITEMS.every((item) => FAQ_ITEMS.includes(item)));

  const norm = (t) => t.replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const faqText = norm(visibleText(read('public/faq.html')));
  for (const s of faqStrings(FAQ_ITEMS)) assert.ok(faqText.includes(norm(s)), `faq.html : ${s.slice(0, 50)}`);

  const home = read('index.html');
  const section = home.match(/<section id="faq"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, 'section FAQ de la landing');
  assert.equal((section.match(/<details class="landing-faq-item">/g) || []).length, LANDING_FAQ_ITEMS.length);
  assert.match(section, /<a href="\/faq" class="landing-faq-link"[^>]*>Toutes les questions<\/a>/);
  const homeText = norm(visibleText(section));
  for (const s of faqStrings(LANDING_FAQ_ITEMS)) assert.ok(homeText.includes(norm(s)), `index.html : ${s.slice(0, 50)}`);
  assert.ok(home.indexOf('data-section="faq"') < home.indexOf('data-section="final"'), 'FAQ avant le CTA final');
});

test('mockup du hero : bulle encre en 12 / 12 / 2 (bas droit à 2 px)', () => {
  assert.match(read('src/components/LandingPage.css'), /\.mockup-msg--user \{[^}]*border-radius: 12px 12px 2px 12px;/);
});

test('404 : page à la charte (kicker, titre, retour), noindex même après la synchro robots de App', () => {
  const page = read('src/components/NotFoundPage.jsx');
  assert.match(page, /className="content-kicker"/);
  assert.match(page, /<h1>Page <em className="ds-highlight">introuvable<\/em><\/h1>/);
  assert.match(page, /setNotFoundRobots\(\)/);
  assert.match(read('src/App.jsx'), /lazyWithChunkReload\(\(\) => import\('\.\/components\/NotFoundPage'\)\)/);
});

test('seoHead : la 404 reste en noindex quand syncRobotsMeta s’exécute ensuite, puis l’index revient', async () => {
  const metas = [];
  globalThis.document = {
    head: { appendChild: (el) => metas.push(el) },
    createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
    querySelector: () => metas[0] || null,
  };
  try {
    const { setNotFoundRobots, syncRobotsMeta } = await import('../../src/lib/seoHead.js');
    const cleanup = setNotFoundRobots();
    syncRobotsMeta('/nimportequoi');
    assert.equal(metas[0].attrs.content, 'noindex, follow');
    cleanup();
    syncRobotsMeta('/');
    assert.match(metas[0].attrs.content, /^index, follow/);
  } finally {
    delete globalThis.document;
  }
});

test('les wrappers des pages publiques ne rétrécissent pas à la hauteur du viewport (#root est un flex à height: 100%)', () => {
  const css = read('src/styles/app/base.css');
  const rule = css.match(/#root > \.landing,[\s\S]*?\{([^}]*)\}/);
  assert.ok(rule, 'règle flex-shrink absente');
  for (const cls of ['.landing', '.content-page', '.legal-page']) assert.ok(rule[0].includes(`#root > ${cls}`), `${cls} manquant`);
  assert.match(rule[1], /flex-shrink:\s*0/);
});
