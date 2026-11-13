import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isInternalLoginLink,
  decidePublicEntry,
  isAuthCallbackUrl,
  loginNavOptions,
} from '../../src/lib/publicEntry.js';

const base = { hasSession: true, pathname: '/', locationState: null, authCallback: false };

test('visite de la landing avec session : on reste', () => {
  assert.equal(decidePublicEntry(base), 'stay');
  assert.equal(decidePublicEntry({ ...base, pathname: '/login' }), 'stay');
  assert.equal(decidePublicEntry({ ...base, pathname: '/inscription' }), 'stay');
});

test("« Recharger l'accueil » : pas de state, pas de callback -> reste", () => {
  assert.equal(decidePublicEntry({ ...base, locationState: undefined }), 'stay');
});

test("clic de connexion avec session : entrée dans l'app", () => {
  const state = loginNavOptions().state;
  assert.equal(decidePublicEntry({ ...base, pathname: '/login', locationState: state }), 'enter');
});

test('clic de connexion sans session : rien à décider (formulaire /login)', () => {
  const state = loginNavOptions().state;
  assert.equal(decidePublicEntry({ ...base, hasSession: false, pathname: '/login', locationState: state }), 'none');
});

test('rafraîchissement de /app/cv : jamais renvoyé vers la landing', () => {
  assert.equal(decidePublicEntry({ ...base, pathname: '/app/cv' }), 'none');
});

test('pages publiques hors entrée (FAQ, guides) : rien à décider', () => {
  assert.equal(decidePublicEntry({ ...base, pathname: '/faq' }), 'none');
});

test("retour OAuth / lien e-mail : entrée dans l'app", () => {
  assert.equal(decidePublicEntry({ ...base, pathname: '/login', authCallback: true }), 'enter');
  assert.equal(isAuthCallbackUrl('', '#access_token=a&refresh_token=b&type=recovery'), true);
  assert.equal(isAuthCallbackUrl('', '#type=recovery'), true);
  assert.equal(isAuthCallbackUrl('?code=abc&next=/app/profil', ''), true);
});

test("URL ordinaire ou erreur de lien : pas un retour d'auth", () => {
  assert.equal(isAuthCallbackUrl('', ''), false);
  assert.equal(isAuthCallbackUrl('?plan=pro', '#error_code=otp_expired'), false);
});

test('loginNavOptions conserve les options et pose le state', () => {
  const o = loginNavOptions({ replace: true });
  assert.equal(o.replace, true);
  assert.equal(o.state.loginIntent, true);
});

test("un lien interne vers /login (page statique) vaut clic de connexion", () => {
  const origin = 'https://job.axelproject.fr';
  assert.equal(isInternalLoginLink({ pathname: '/login', referrer: `${origin}/faq`, origin }), true);
  assert.equal(isInternalLoginLink({ pathname: '/inscription', referrer: `${origin}/ats`, origin }), true);
  assert.equal(isInternalLoginLink({ pathname: '/login', referrer: '', origin }), false, 'accès direct ou favori');
  assert.equal(isInternalLoginLink({ pathname: '/login', referrer: 'https://exemple.fr/', origin }), false, 'autre site');
  assert.equal(isInternalLoginLink({ pathname: '/', referrer: `${origin}/faq`, origin }), false, 'Recharger l’accueil');
  assert.equal(isInternalLoginLink({ pathname: '/login', referrer: 'pas une url', origin }), false);
});

test("session apparue pendant la visite : le formulaire envoyé entre dans l'app", () => {
  /* App passe sawNoSession=true à authCallback quand la session arrive après un état sans session. */
  assert.equal(decidePublicEntry({ hasSession: true, pathname: '/login', locationState: null, authCallback: true }), 'enter');
  assert.equal(decidePublicEntry({ hasSession: true, pathname: '/login', locationState: null, authCallback: false }), 'stay');
});

