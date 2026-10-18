import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('oeil masque par defaut et se cale dans le champ', async () => {
  const field = await readFile(path.join(ROOT, 'src/components/ui/PasswordInput.jsx'), 'utf8');
  const css = await readFile(path.join(ROOT, 'src/styles/AuthForm.css'), 'utf8');
  const auth = await readFile(path.join(ROOT, 'src/components/AuthForm.jsx'), 'utf8');
  const app = await readFile(path.join(ROOT, 'src/App.jsx'), 'utf8');
  assert.match(field, /useState\(false\)/);
  assert.match(field, /type=\{visible \? 'text' : 'password'\}/);
  assert.match(css, /padding-right: 2\.5rem/);
  assert.match(css, /bottom: var\(--ds-space-sm\)/);
  assert.doesNotMatch(css, /right: 2\.35rem/);
  assert.match(auth, /<PasswordInput/);
  assert.match(app, /placeholder="Nouveau mot de passe"/);
  assert.match(app, /<PasswordInput/);
});
