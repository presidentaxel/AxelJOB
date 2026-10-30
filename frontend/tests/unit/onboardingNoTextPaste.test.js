import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('AXE-497 : l’onboarding ne propose plus de coller le texte du CV', async () => {
  const text = await readFile(
    path.join(FRONTEND_ROOT, 'src/components/OnboardingWizard.jsx'),
    'utf8',
  );
  assert.equal(text.includes('text_paste'), false);
  assert.equal(text.includes('handleTextImport'), false);
  assert.equal(text.includes('import-text'), false);
  assert.equal(text.includes('onb-textarea'), false);
  assert.equal(text.includes('Importer un CV'), true);
  assert.equal(text.includes('Saisie manuelle'), true);
  assert.equal(text.includes('Passer pour l'), true);
});
