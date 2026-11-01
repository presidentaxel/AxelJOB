/**
 * Tests unitaires — template virtuel Beta (AXE-374).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BETA_CANVAS_TEMPLATE,
  BETA_CANVAS_TEMPLATE_ID,
  betaCanvasRenderFields,
  hasUsableBetaCanvasLayout,
  isBetaCanvasTemplateId,
  resolveBetaCanvasPreview,
  withBetaCanvasTemplate,
} from '../../src/lib/betaCanvasTemplate.js';

test('isBetaCanvasTemplateId', () => {
  assert.equal(isBetaCanvasTemplateId('beta'), true);
  assert.equal(isBetaCanvasTemplateId(' minimal '), false);
  assert.equal(isBetaCanvasTemplateId(null), false);
});

test('withBetaCanvasTemplate injecte en tête sans doublon', () => {
  const once = withBetaCanvasTemplate([{ id: 'minimal', name: 'Minimal' }]);
  assert.equal(once[0].id, BETA_CANVAS_TEMPLATE_ID);
  assert.equal(once.length, 2);
  const twice = withBetaCanvasTemplate(once);
  assert.equal(twice.length, 2);
  assert.equal(twice[0].name, BETA_CANVAS_TEMPLATE.name);
});

test('hasUsableBetaCanvasLayout', () => {
  assert.equal(hasUsableBetaCanvasLayout(null), false);
  assert.equal(hasUsableBetaCanvasLayout({ pages: [{ blocks: [] }] }), false);
  assert.equal(
    hasUsableBetaCanvasLayout({ pages: [{ blocks: [{ id: 'a', type: 'text', x: 0, y: 0, w: 10, h: 10 }] }] }),
    true,
  );
});

test('resolveBetaCanvasPreview garde le canvas Beta et ignore le mode Stable', () => {
  const layout = { pages: [{ blocks: [{ id: 'a', type: 'text', x: 0, y: 0, w: 10, h: 10 }] }] };
  const cv = { prenom: 'Louis' };
  assert.equal(resolveBetaCanvasPreview({ betaMode: false, templateId: 'minimal', profileLayout: layout, cv }), null);
  const fromMode = resolveBetaCanvasPreview({ betaMode: true, templateId: 'minimal', profileLayout: layout, cv });
  assert.equal(fromMode.layout, layout);
  assert.equal(fromMode.cv, cv);
  const fromTemplate = resolveBetaCanvasPreview({ betaMode: false, templateId: 'beta', profileLayout: layout, cv });
  assert.equal(fromTemplate.layout, layout);
  const own = { ...cv, layout };
  const fromCv = resolveBetaCanvasPreview({
    betaMode: true,
    templateId: 'minimal',
    profileLayout: { pages: [] },
    cv: own,
  });
  assert.equal(fromCv.layout, layout);
  assert.equal(resolveBetaCanvasPreview({ betaMode: true, templateId: 'beta', profileLayout: null, cv }), null);
});

test('betaCanvasRenderFields', () => {
  const layout = { pages: [{ blocks: [{ id: 'a', type: 'text', x: 0, y: 0, w: 10, h: 10 }] }] };
  assert.deepEqual(betaCanvasRenderFields('minimal', layout), {});
  assert.deepEqual(betaCanvasRenderFields('beta', null), {});
  assert.deepEqual(betaCanvasRenderFields('beta', layout), { layout });
});
