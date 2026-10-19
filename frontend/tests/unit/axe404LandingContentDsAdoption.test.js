/**
 * AXE-404 : landing et pages contenu n’utilisent plus le markup
 * `button button-primary|secondary` — uniquement <Button> / <Button as={Link}>.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = path.join(FRONTEND_ROOT, 'src');

const LEGACY_BUTTON_CLASS_RE =
  /(?:className|class)\s*=\s*(?:["'`][^"'`]*|\{\s*["'`][^"'`]*)\b(?:button|btn)-(?:primary|secondary|tertiary|ghost|success)\b/;

const FILES = [
  'components/LandingPage.jsx',
  'components/FaqPage.jsx',
  'components/AtsPage.jsx',
  'components/ArticlesPages.jsx',
];

const CONTENT_PAGES = [
  'components/FaqPage.jsx',
  'components/AtsPage.jsx',
  'components/ArticlesPages.jsx',
];

function lineHasLegacyButtonClass(line) {
  return LEGACY_BUTTON_CLASS_RE.test(line);
}

test('Landing, FAQ, ATS et Articles n’ont plus de className button-*', async () => {
  const offenders = [];
  for (const rel of FILES) {
    const text = await readFile(path.join(SRC, rel), 'utf8');
    text.split('\n').forEach((line, idx) => {
      if (lineHasLegacyButtonClass(line)) {
        offenders.push(`${rel}:${idx + 1}:${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});

test('Landing importe Button ; FAQ, ATS et Articles passent par ContentChrome (qui importe Button)', async () => {
  const landing = await readFile(path.join(SRC, 'components/LandingPage.jsx'), 'utf8');
  assert.match(landing, /import Button from '\.\/ui\/Button\.jsx'/);
  for (const rel of CONTENT_PAGES) {
    const text = await readFile(path.join(SRC, rel), 'utf8');
    assert.match(text, /ContentChrome\.jsx/, rel);
  }
  const chrome = await readFile(path.join(SRC, 'components/ContentChrome.jsx'), 'utf8');
  assert.match(chrome, /import Button from '\.\/ui\/Button\.jsx'/);
});

test('Les CTA des pages de contenu sont rendus via Button as={Link} vers /login (ContentChrome)', async () => {
  const text = await readFile(path.join(SRC, 'components/ContentChrome.jsx'), 'utf8');
  assert.match(text, /<Button\s+as=\{Link\}\s+to="\/login"/);
  assert.doesNotMatch(text, /className="button button-primary/);
  assert.doesNotMatch(text, /<Link to="\/login" className="button/);
});

test('Landing conserve type="button", goLogin et les data-attr CTA', async () => {
  const text = await readFile(path.join(SRC, 'components/LandingPage.jsx'), 'utf8');
  assert.match(text, /variant="primary"/);
  assert.match(text, /variant="secondary"/);
  assert.match(text, /className="landing-cta-nav"/);
  assert.match(text, /className="landing-mobile-cta"/);
  assert.match(text, /className="landing-cta-hero"/);
  assert.match(text, /className="pricing-cta"/);
  assert.match(text, /goLogin\('nav-cta-signup'/);
  assert.match(text, /goLogin\('nav-cta-start'/);
  assert.match(text, /goLogin\('nav-cta-drawer'/);
  assert.match(text, /goLogin\('home-hero-cta-signup'/);
  assert.match(text, /goLogin\('home-pricing-cta-free'/);
  assert.match(text, /goLogin\('home-pricing-cta-pro'/);
  assert.match(text, /goLogin\('home-final-cta-signup'/);
  assert.match(text, /analyticsAttrs\('nav-cta-signup', 'header', 'primary', 'cta'\)/);
  assert.match(text, /analyticsAttrs\('home-hero-cta-signup', 'hero', 'primary', 'cta'\)/);
  assert.doesNotMatch(text, /className="button button-primary/);
  assert.doesNotMatch(text, /className="button button-secondary/);
});

test('FAQ / ATS / Articles déclarent leur CTA via ContentCta, qui garde persistLoginCta et analyticsAttrs', async () => {
  const faq = await readFile(path.join(SRC, 'components/FaqPage.jsx'), 'utf8');
  const ats = await readFile(path.join(SRC, 'components/AtsPage.jsx'), 'utf8');
  const articles = await readFile(path.join(SRC, 'components/ArticlesPages.jsx'), 'utf8');
  const chrome = await readFile(path.join(SRC, 'components/ContentChrome.jsx'), 'utf8');
  assert.match(faq, /<ContentCta signupId="faq-cta-signup"/);
  assert.match(ats, /<ContentCta signupId="ats-cta-signup"/);
  assert.match(articles, /<ContentCta signupId={signupId}/);
  assert.match(chrome, /persistLoginCta\(signupId\)/);
  assert.match(chrome, /analyticsAttrs\(signupId, 'content', 'primary', 'cta'\)/);
});
