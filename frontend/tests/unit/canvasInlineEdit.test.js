import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fieldValueLooksLikeHtml,
  htmlToPlainText,
  isCanvasInlineEditableType,
  normalizeRichTextHtml,
  repairCanvasPlaceholderGlue,
  sanitizeRichTextHtml,
  setByPath,
} from '../../src/lib/canvasInlineEdit.js';

test('setByPath met a jour un chemin imbrique', () => {
  const cv = { prenom: 'A', experiences: [{ poste: 'Dev' }] };
  setByPath(cv, 'experiences.0.poste', 'Lead');
  assert.equal(cv.experiences[0].poste, 'Lead');
});

test('isCanvasInlineEditableType couvre texte et semantique', () => {
  assert.equal(isCanvasInlineEditableType('text'), true);
  assert.equal(isCanvasInlineEditableType('identity'), true);
  assert.equal(isCanvasInlineEditableType('photo'), false);
});

test('normalise le HTML riche echappe par un contentEditable', () => {
  const escaped = '&lt;span style=&quot;font-weight: normal;&quot;&gt;L&lt;/span&gt;ouitos';

  assert.equal(
    normalizeRichTextHtml(escaped),
    '<span style="font-weight: normal;">L</span>ouitos',
  );
  assert.equal(fieldValueLooksLikeHtml(escaped), true);
});

test('sanitizeRichTextHtml sans DOM escape le markup (Node)', () => {
  const out = sanitizeRichTextHtml(
    '<b>A</b><script>evil()</script><a href="https://x">link</a>',
  );
  assert.equal(out.includes('<script'), false);
  assert.equal(out.includes('<b>'), false);
  assert.match(out, /&lt;b&gt;A&lt;\/b&gt;/);
  assert.match(out, /&lt;script&gt;/);
});

test('le placeholder ne reste pas collé au texte', () => {
  assert.equal(
    repairCanvasPlaceholderGlue('Texte libreen troisième année'),
    'en troisième année',
  );
  assert.equal(htmlToPlainText('<span class="cv-changed">motivé</span>'), 'motivé');
  assert.equal(repairCanvasPlaceholderGlue('Texte libre'), 'Texte libre');
});
