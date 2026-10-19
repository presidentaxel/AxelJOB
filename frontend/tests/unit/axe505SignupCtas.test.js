/**
 * AXE-505 : les CTA d'acquisition ouvrent /inscription avec le plan.
 * « Se connecter » et « Commencer » restent sur /login, sans plan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function hrefForAttr(html, attr) {
  const re = new RegExp(`<a href="([^"]+)"[^>]*data-attr="${attr}"`);
  const match = html.match(re);
  assert.ok(match, `href manquant pour ${attr}`);
  return match[1];
}

test('index.html : acquisition vers /inscription, connexion vers /login', async () => {
  const html = await readFile(path.join(FRONTEND_ROOT, 'index.html'), 'utf8');
  assert.equal(hrefForAttr(html, 'home-hero-cta-signup'), '/inscription?plan=free');
  assert.equal(hrefForAttr(html, 'home-final-cta-signup'), '/inscription?plan=free');
  assert.equal(hrefForAttr(html, 'home-pricing-cta-free'), '/inscription?plan=free');
  assert.equal(hrefForAttr(html, 'home-pricing-cta-pro'), '/inscription?plan=pro');
  assert.equal(hrefForAttr(html, 'nav-cta-signup'), '/login');
  assert.equal(hrefForAttr(html, 'nav-cta-start'), '/login');
  assert.equal(html.includes('nav-cta-signup"') && html.includes('href="/login?plan='), false);
});

test('Landing et App envoient les quatre CTA vers /inscription', async () => {
  const landing = await readFile(path.join(FRONTEND_ROOT, 'src/components/LandingPage.jsx'), 'utf8');
  const app = await readFile(path.join(FRONTEND_ROOT, 'src/App.jsx'), 'utf8');
  assert.match(landing, /goLogin\('home-hero-cta-signup', onSignupClick\)/);
  assert.match(landing, /goLogin\('home-final-cta-signup', onSignupClick\)/);
  assert.match(landing, /goLogin\('home-pricing-cta-free', onSignupClick\)/);
  assert.match(landing, /goLogin\('home-pricing-cta-pro', onProClick\)/);
  assert.match(landing, /goLogin\('nav-cta-signup', onCtaClick\)/);
  assert.match(landing, /goLogin\('nav-cta-start', onCtaClick\)/);
  assert.match(landing, /goLogin\('nav-cta-drawer', onCtaClick\)/);
  assert.match(app, /onCtaClick=\{\(\) => navigate\('\/login'\)\}/);
  assert.match(app, /onSignupClick=\{\(\) => navigate\('\/inscription\?plan=free'\)\}/);
  assert.match(app, /onProClick=\{\(\) => navigate\('\/inscription\?plan=pro'\)\}/);
  assert.doesNotMatch(app, /navigate\('\/login\?plan=pro'\)/);
});
