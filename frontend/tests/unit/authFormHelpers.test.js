import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('connexion et inscription montrent les aides avant envoi', async () => {
  const auth = await readFile(path.join(ROOT, 'src/components/AuthForm.jsx'), 'utf8');
  assert.match(auth, /className="auth-required"/);
  assert.match(auth, /placeholder="toi@email.fr"/);
  assert.match(auth, /placeholder="6 caractères minimum"/);
  assert.match(auth, /placeholder="Le même mot de passe"/);
  assert.match(auth, /passwordTooShort && \([\s\S]*Au moins 6 caractères\./);
  assert.match(auth, /passwordMismatch && \([\s\S]*Doit être identique au mot de passe\./);
  assert.match(auth, /Adresse e-mail invalide\./);
  assert.match(auth, /invalid=\{passwordTooShort\}/);
  assert.match(auth, /invalid=\{passwordMismatch\}/);
});
