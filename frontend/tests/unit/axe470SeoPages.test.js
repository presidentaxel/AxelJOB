/**
 * AXE-470 : charte Axel sur les pages SEO (HTML statiques de public/ + équivalents React).
 * Garde-fous : plus de violet/indigo, polices Axel, tokens uniquement, SEO inchangé,
 * en-tête / pied de page identiques partout et alignés sur landingCopy.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { landingText } from '../../src/content/landingCopy.js';
import { contentSlug } from '../../src/lib/contentSlug.js';
import { decodeEntities, stripTags } from './helpers/htmlText.js';
import { GENERATED_RELS } from '../../scripts/check-token-drift.mjs';
import { OUT_PATHS, buildTokensCss } from '../../scripts/build-tokens.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const html = (name) => read(path.join(PUBLIC, `${name}.html`));

const SEO_PAGES = ['ats', 'faq', 'modeles-cv', 'guide-cv', 'erreurs-cv', 'cv-par-metier', 'cv-adapte-chaque-offre'];
const LEGAL_PAGES = ['mentions-legales', 'confidentialite', 'cgu'];
const ERROR_PAGES = ['404', '500'];
const CHROME_PAGES = [...SEO_PAGES, ...LEGAL_PAGES, ...ERROR_PAGES];
const ALL_HTML = readdirSync(PUBLIC).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));

/** title / description / canonical / H1 / nombre de H2 / JSON-LD relevés avant AXE-470 (b89efdf). */
const SEO_SNAPSHOT = {
  ats: { title: "ATS : qu'est-ce que c'est et comment ça fonctionne vraiment ? | AxeL Job", description: 'ATS : définition, statistiques recruteurs, rejet automatique vs humain, parsing PDF/DOCX, volume de candidatures. Comment faire passer ton CV.', canonical: 'https://job.axelproject.fr/ats', h1: "Qu'est-ce qu'un ATS ?", ld: [] },
  faq: { title: "CV, ATS et IA : les réponses aux questions que tout le monde se pose | AxeL Job", description: 'ATS, PDF, adaptation du CV, IA, longueur, orthographe : réponses sourcées (Enhancv, HBS, EDLIGO, Jobscan, Teal, MIT Sloan, Resume Genius, Canva).', canonical: 'https://job.axelproject.fr/faq', h1: 'FAQ : CV, ATS et IA', ld: ['0593456dca1dfbf7'] },
  'modeles-cv': { title: "Modèles de CV : comment choisir un template qui passe l'ATS et convainc un recruteur | AxeL Job", description: "CV design vs ATS : parsing, colonnes, formats chronologique, fonctionnel, combiné. Checklist d'un bon modèle (titres, typo, en-têtes).", canonical: 'https://job.axelproject.fr/modeles-cv', h1: 'Modèles de CV : comment choisir le bon', ld: [] },
  'guide-cv': { title: 'Comment faire un bon CV en 2025 : les règles qui font vraiment la différence | AxeL Job', description: "Durée de lecture d'un CV par un recruteur, titre, résumé, chiffres, mots-clés, structure. Ce que les recruteurs cherchent et ce qu'il faut éviter.", canonical: 'https://job.axelproject.fr/guide-cv', h1: 'Comment faire un bon CV', ld: [] },
  'erreurs-cv': { title: 'Les 7 erreurs les plus courantes dans un CV (et comment les corriger) | AxeL Job', description: 'Orthographe, CV générique, email non pro, format ATS, chiffres manquants, longueur, résumé vague : les 7 erreurs à corriger tout de suite.', canonical: 'https://job.axelproject.fr/erreurs-cv', h1: 'Erreurs fréquentes dans un CV', ld: [] },
  'cv-par-metier': { title: 'CV par secteur : les mots-clés qui font la différence en tech, marketing et finance | AxeL Job', description: 'Tech, marketing, finance : quels mots-clés et quelle logique de CV pour les ATS et les recruteurs. Contextualiser les compétences, éviter le générique.', canonical: 'https://job.axelproject.fr/cv-par-metier', h1: 'CV par secteur : tech, marketing, finance', ld: [] },
  'cv-adapte-chaque-offre': { title: "Pourquoi adapter son CV à chaque offre d'emploi (et comment le faire efficacement) | AxeL Job", description: "Données recruteurs sur la personnalisation du CV, mots-clés ATS, signal d'intention, temps gagné avec l'IA. Guide + outil AxeL Job.", canonical: 'https://job.axelproject.fr/cv-adapte-chaque-offre', h1: 'CV adapté à chaque offre', ld: ['1d73b8026257dd71'] },
};

function seoOf(src) {
  return {
    title: src.match(/<title>([\s\S]*?)<\/title>/)[1],
    description: src.match(/<meta name="description" content="([^"]*)"/)[1],
    canonical: src.match(/<link rel="canonical" href="([^"]*)"/)[1],
    // textContent du H1 : le mot mis en valeur (<em class="ds-highlight">) ne change pas le texte.
    h1: stripTags(src.match(/<h1>([\s\S]*?)<\/h1>/)[1]),
    ld: [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
      crypto.createHash('sha256').update(m[1].trim()).digest('hex').slice(0, 16),
    ),
  };
}

test('title, meta description, canonical, H1 et JSON-LD des 7 pages SEO sont inchangés', () => {
  for (const page of SEO_PAGES) {
    assert.deepEqual(seoOf(html(page)), SEO_SNAPSHOT[page], page);
  }
});

test('une seule H1 par page SEO et au moins une H2', () => {
  for (const page of SEO_PAGES) {
    const src = html(page);
    assert.equal((src.match(/<h1[\s>]/g) || []).length, 1, `${page}: H1`);
    assert.ok((src.match(/<h2[\s>]/g) || []).length >= 1, `${page}: H2`);
  }
});

test('plus aucune trace du violet / indigo ni de Plus Jakarta Sans (pages statiques + CSS)', () => {
  const files = [
    ...ALL_HTML.map((n) => path.join(PUBLIC, `${n}.html`)),
    path.join(PUBLIC, 'static-pages.css'),
    path.join(PUBLIC, 'consent-banner.css'),
  ];
  for (const file of files) {
    const src = read(file);
    for (const banned of [/#5b4cff/i, /#4f46e5/i, /#4338ca/i, /#eef2ff/i, /Plus Jakarta/i, /fonts\.googleapis\.com/i, /fonts\.gstatic\.com/i]) {
      assert.doesNotMatch(src, banned, `${path.basename(file)} contient ${banned}`);
    }
  }
});

test('static-pages.css et consent-banner.css : aucune couleur en dur, variables --ds-* seulement', () => {
  for (const name of ['static-pages.css', 'consent-banner.css']) {
    const src = read(path.join(PUBLIC, name));
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, `${name}: hex`);
    assert.doesNotMatch(src, /\brgba?\(/, `${name}: rgb()`);
    assert.match(src, /var\(--ds-/, `${name}: consomme les tokens`);
  }
});

test('chaque page statique charge ds-tokens.css puis axel-fonts.css puis static-pages.css, theme-color crème', () => {
  for (const name of ALL_HTML) {
    const src = html(name);
    const tokens = src.indexOf('<link rel="stylesheet" href="/ds-tokens.css" />');
    const fonts = src.indexOf('<link rel="stylesheet" href="/fonts/axel-fonts.css" />');
    const sheet = src.indexOf('<link rel="stylesheet" href="/static-pages.css" />');
    assert.ok(tokens > -1 && fonts > tokens && sheet > fonts, `${name}: ordre des feuilles`);
    assert.match(src, /<meta name="theme-color" content="#faf6ef" \/>/, `${name}: theme-color`);
  }
});

test('public/ds-tokens.css est la copie exacte du CSS généré depuis tokens.json', () => {
  const { css } = buildTokensCss(readFileSync(path.join(ROOT, 'src/design/tokens.json'), 'utf8'));
  assert.equal(OUT_PATHS.length, 2);
  for (const out of OUT_PATHS) assert.equal(read(out), css.replace(/\r\n/g, '\n'), out);
  assert.ok(GENERATED_RELS.includes('frontend/public/ds-tokens.css'));
  assert.ok(GENERATED_RELS.includes('frontend/src/styles/ds-tokens.generated.css'));
});

function block(src, tag) {
  const cls = tag === 'header' ? 'public-header' : `content-${tag}`;
  const m = src.match(new RegExp(`<${tag} class="${cls}"[^>]*>[\\s\\S]*?</${tag}>`));
  assert.ok(m, `${tag} introuvable`);
  return m[0].split('\n').map((l) => l.trim()).join('\n');
}

/** La barre porte aria-current / is-current selon la page : on les neutralise pour comparer le reste. */
function neutral(headerBlock) {
  return headerBlock.replace(/ aria-current="page"/g, '').replace(/ is-current/g, '');
}

test('en-tête et pied de page identiques sur toutes les pages SEO, légales et d’erreur', () => {
  const header = neutral(block(html('ats'), 'header'));
  const footer = block(html('ats'), 'footer');
  for (const page of CHROME_PAGES) {
    assert.equal(neutral(block(html(page), 'header')), header, `${page}: header`);
    assert.equal(block(html(page), 'footer'), footer, `${page}: footer`);
  }
});

test('en-tête et pied de page statiques reprennent les libellés et URLs de landingCopy.js', () => {
  const src = html('ats');
  const header = block(src, 'header');
  const footer = block(src, 'footer');
  for (const [href, label] of [
    ['/ats', landingText.footerAts],
    ['/faq', landingText.footerFaq],
    ['/modeles-cv', landingText.navModelesShort],
    ['/guide-cv', landingText.navGuide],
    ['/erreurs-cv', landingText.footerErreurs],
    ['/cv-par-metier', landingText.footerMetier],
    ['/cv-adapte-chaque-offre', landingText.footerAdapte],
    ['/login', landingText.ctaLogin],
    ['/inscription?plan=free', landingText.ctaTry],
    ['/#tarifs', landingText.navPricing],
  ]) {
    assert.ok(header.includes(`href="${href}"`) && header.includes(`>${label}</a>`), `header ${href} ${label}`);
  }
  assert.ok(header.includes(`>${landingText.navResources}</span>`));
  assert.ok(header.includes('class="public-header-cta"') && header.includes('href="/inscription?plan=free"'));
  for (const [href, label] of [
    ['/ats', landingText.footerAts],
    ['/faq', landingText.footerFaq],
    ['/modeles-cv', landingText.footerModeles],
    ['/guide-cv', landingText.footerGuide],
    ['/erreurs-cv', landingText.footerErreurs],
    ['/cv-par-metier', landingText.footerMetier],
    ['/cv-adapte-chaque-offre', landingText.footerAdapte],
    ['/mentions-legales', landingText.legalMentions],
    ['/confidentialite', landingText.legalPrivacy],
    ['/cgu', landingText.legalTerms],
  ]) {
    assert.ok(footer.includes(`href="${href}"`) && footer.includes(`>${label}</a>`), `footer ${href}`);
  }
  assert.ok(footer.includes(landingText.footerBefore));
});

test('chaque page SEO mène vers /inscription?plan=free (CTA de fin de page) avec un identifiant d’analytics', () => {
  for (const page of SEO_PAGES) {
    const cta = html(page).match(/<section class="content-cta"[\s\S]*?<\/section>/);
    assert.ok(cta, `${page}: CTA`);
    assert.match(cta[0], /href="\/inscription\?plan=free" class="button button-primary" data-attr="[a-z]+-cta-signup"/, page);
  }
});

test('sommaire : ancres = slug des H2, présent à partir de 4 sections', () => {
  for (const page of ['ats', 'modeles-cv', 'cv-par-metier', 'cv-adapte-chaque-offre']) {
    const src = html(page);
    const toc = src.match(/<nav class="content-toc"[\s\S]*?<\/nav>/);
    assert.ok(toc, `${page}: sommaire`);
    const anchors = [...toc[0].matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    const ids = [...src.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(anchors, ids, page);
    for (const m of src.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)) {
      assert.equal(m[1], contentSlug(decodeEntities(m[2], ' ')), page);
    }
  }
  for (const page of ['guide-cv', 'erreurs-cv']) assert.doesNotMatch(html(page), /content-toc/, page);
});

test('FAQ statique : questions en <details>, H2 conservés', () => {
  const src = html('faq');
  const n = (src.match(/<details class="faq-item"/g) || []).length;
  assert.ok(n >= 6);
  assert.equal((src.match(/<summary><h2 class="faq-question"/g) || []).length, n);
  assert.doesNotMatch(src, /<article class="faq-item"/);
});

test('React : une seule feuille partagée, composants communs, ContentPages/LegalPages hors allowlist hex', () => {
  const shared = read(path.join(ROOT, 'src/components/ContentPages.css'));
  assert.match(shared, /@import '\.\.\/\.\.\/public\/static-pages\.css'/);
  assert.doesNotMatch(shared, /#[0-9a-fA-F]{3,8}\b/);
  for (const f of ['AtsPage', 'FaqPage', 'ArticlesPages', 'LegalPages']) {
    const src = read(path.join(ROOT, `src/components/${f}.jsx`));
    assert.match(src, /ContentChrome\.jsx/, f);
    assert.doesNotMatch(src, /content-footer-nav|content-back/, f);
  }
  const allow = JSON.parse(readFileSync(path.join(ROOT, 'scripts/css-hex-allowlist.json'), 'utf8')).files;
  assert.ok(!allow.includes('components/ContentPages.css'));
  assert.ok(!allow.includes('components/LegalPages.css'));
});
