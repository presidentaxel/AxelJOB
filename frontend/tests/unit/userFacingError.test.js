import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHUNK_UPDATE_MESSAGE,
  NETWORK_MESSAGE,
  SUPABASE_DEV_CONFIG_MESSAGE,
  SUPABASE_PROD_UNAVAILABLE,
  TIMEOUT_MESSAGE,
  supabaseConfigMessage,
  userFacingAuthError,
  userFacingHttpMessage,
} from '../../src/lib/userFacingError.js';

test('la config Supabase ne nomme les variables qu’en dev', () => {
  assert.match(supabaseConfigMessage(true), /VITE_SUPABASE_URL/);
  assert.equal(supabaseConfigMessage(true), SUPABASE_DEV_CONFIG_MESSAGE);
  assert.equal(supabaseConfigMessage(false), SUPABASE_PROD_UNAVAILABLE);
  assert.doesNotMatch(supabaseConfigMessage(false), /VITE_|\\.env/);
});

test('le catalogue couvre les statuts et masque le technique', () => {
  assert.equal(userFacingHttpMessage(401, 'Authentification requise.'), 'Ta session a expiré. Reconnecte-toi.');
  assert.equal(userFacingHttpMessage(402, ''), 'Tu as atteint la limite de ton offre.');
  assert.equal(userFacingHttpMessage(403, ''), 'Tu n\'as pas accès à cette page.');
  assert.equal(userFacingHttpMessage(404, 'column foo does not exist'), 'On ne trouve pas cet élément.');
  assert.equal(userFacingHttpMessage(404, 'Modèle introuvable.'), 'Modèle introuvable.');
  assert.equal(userFacingHttpMessage(413, 'too big'), 'Le fichier est trop lourd.');
  assert.equal(userFacingHttpMessage(422, 'Email invalide.'), 'Email invalide.');
  assert.equal(userFacingHttpMessage(429, 'Quota temporairement atteint.'), 'Trop de tentatives. Réessaie dans un instant.');
  assert.match(userFacingHttpMessage(500, 'GEMINI_API_KEY manquante.'), /problème est survenu/);
  assert.doesNotMatch(userFacingHttpMessage(500, 'GEMINI_API_KEY manquante.'), /GEMINI|API_KEY/);
  assert.match(userFacingHttpMessage(502, 'Réponse Gemini vide'), /n'a pas répondu/);
  assert.match(userFacingHttpMessage(503, 'Paiement non configuré.'), /pas disponible pour le moment/);
  assert.doesNotMatch(userFacingHttpMessage(503, 'Support non configuré (SUPPORT_EMAIL).'), /SUPPORT_EMAIL/);
  assert.equal(userFacingHttpMessage(504, '<html>bad gateway</html>'), TIMEOUT_MESSAGE);
  assert.equal(userFacingHttpMessage(400, 'PDF scanné.'), 'PDF scanné.');
});

test('réseau, timeout et chunk ont une phrase dédiée', () => {
  assert.match(TIMEOUT_MESSAGE, /serveur ne répond pas/);
  assert.equal(NETWORK_MESSAGE, 'Connexion impossible. Vérifie ton réseau puis réessaie.');
  assert.match(CHUNK_UPDATE_MESSAGE, /mise à jour/);
});

test('l’auth ne renvoie pas l’anglais brut de Supabase', () => {
  assert.equal(
    userFacingAuthError({ message: 'Invalid login credentials' }),
    'E-mail ou mot de passe incorrect.',
  );
  assert.equal(
    userFacingAuthError({ message: 'User already registered' }),
    'Un compte existe déjà avec cet e-mail.',
  );
  assert.match(userFacingAuthError({ message: 'Email link is invalid or has expired' }), /plus valable/);
  assert.match(userFacingAuthError({ status: 429, message: 'rate limit' }), /Trop de tentatives/);
  assert.equal(userFacingAuthError({ message: 'Entre ton email.' }), 'Entre ton email.');
});
