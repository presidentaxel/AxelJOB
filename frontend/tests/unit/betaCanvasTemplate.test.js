/**
 * Tests unitaires — template virtuel Beta (AXE-374).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BETA_CANVAS_TEMPLATE,
  BETA_CANVAS_TEMPLATE_ID,
  betaCanvasRenderFields,
  betaCanvasRenderFieldsForCv,
  hasUsableBetaCanvasLayout,
  isBetaCanvasTemplateId,
  projectCvDeltaOntoLayout,
  resolveBetaCanvasPreview,
  flagCanvasOverlaps,
  resolveBetaPreviewCv,
  applyCanvasFitText,
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

test('withBetaCanvasTemplate retire Beta hors du mode Beta', () => {
  const stable = withBetaCanvasTemplate(
    [{ id: 'beta', name: 'Beta' }, { id: 'minimal', name: 'Minimal' }],
    { includeBeta: false },
  );
  assert.deepEqual(stable.map((t) => t.id), ['minimal']);
  const beta = withBetaCanvasTemplate([{ id: 'minimal', name: 'Minimal' }], { includeBeta: true });
  assert.equal(beta[0].id, BETA_CANVAS_TEMPLATE_ID);
});

test('hasUsableBetaCanvasLayout', () => {
  assert.equal(hasUsableBetaCanvasLayout(null), false);
  assert.equal(hasUsableBetaCanvasLayout({ pages: [{ blocks: [] }] }), false);
  assert.equal(
    hasUsableBetaCanvasLayout({ pages: [{ blocks: [{ id: 'a', type: 'text', x: 0, y: 0, w: 10, h: 10 }] }] }),
    true,
  );
});

test('resolveBetaCanvasPreview suit le template choisi, pas le mode Beta', () => {
  const layout = { pages: [{ blocks: [{ id: 'a', type: 'text', x: 0, y: 0, w: 10, h: 10 }] }] };
  const cv = { prenom: 'Louis' };
  assert.equal(resolveBetaCanvasPreview({ templateId: 'minimal', profileLayout: layout, cv }), null);
  assert.equal(resolveBetaCanvasPreview({ templateId: 'classic', profileLayout: layout, cv }), null);
  const fromTemplate = resolveBetaCanvasPreview({ templateId: 'beta', profileLayout: layout, cv });
  assert.equal(fromTemplate.layout, layout);
  assert.equal(fromTemplate.cv, cv);
  const own = { ...cv, layout };
  const fromCv = resolveBetaCanvasPreview({
    templateId: 'beta',
    profileLayout: { pages: [] },
    cv: own,
  });
  assert.equal(fromCv.layout, layout);
  assert.equal(resolveBetaCanvasPreview({ templateId: 'beta', profileLayout: null, cv }), null);
});

test('resolveBetaPreviewCv prend la traduction et la photo fraîche', () => {
  const base = { prenom: 'Louis', photo_url: 'stale' };
  const adapted = { prenom: 'Adapté', photo_url: 'stale-adapted' };
  const localized = { prenom: 'Louis EN', photo_url: 'stale-loc' };
  assert.equal(
    resolveBetaPreviewCv({ previewVariant: 'original', lastAdaptedCv: adapted, lastBaseCv: base, localizedCv: localized }).prenom,
    'Louis',
  );
  const adaptedPreview = resolveBetaPreviewCv({
    previewVariant: 'modified',
    lastAdaptedCv: adapted,
    lastBaseCv: base,
    localizedCv: localized,
    freshPreviewPhotoUrl: 'https://signed.example/photo',
  });
  assert.equal(adaptedPreview.prenom, 'Adapté');
  assert.equal(adaptedPreview.photo_url, 'https://signed.example/photo');
  const translated = resolveBetaPreviewCv({
    previewVariant: 'modified',
    lastAdaptedCv: null,
    lastBaseCv: base,
    localizedCv: localized,
    freshPreviewPhotoUrl: 'https://signed.example/photo',
  });
  assert.equal(translated.prenom, 'Louis EN');
  assert.equal(translated.photo_url, 'https://signed.example/photo');
});

test('resolveBetaCanvasPreview aligne le texte figé sur le CV adapté', () => {
  const layout = {
    pages: [{
      blocks: [
        {
          id: 'bullet',
          type: 'text',
          x: 20,
          y: 40,
          w: 150,
          h: 6,
          content: '• Suivi des quotas sur les marchés.',
        },
        {
          id: 'line-a',
          type: 'text',
          x: 20,
          y: 80,
          w: 150,
          h: 5,
          content: 'Consultant qui pilote des études',
        },
        {
          id: 'line-b',
          type: 'text',
          x: 20,
          y: 86,
          w: 150,
          h: 5,
          content: 'quantitatives pour des marques.',
        },
        { id: 'rule', type: 'shape:line', x: 0, y: 10, w: 210, h: 0.3 },
      ],
    }],
  };
  const base = {
    resume: 'Consultant qui pilote des études quantitatives pour des marques.',
    experiences: [{ bullet_points: ['Suivi des quotas sur les marchés.'] }],
  };
  const adapted = {
    resume: 'Consultant qui relie les études quantitatives aux décisions marketing.',
    experiences: [{ bullet_points: ['Pilotage des quotas et de la qualité terrain.'] }],
  };
  const preview = resolveBetaCanvasPreview({
    templateId: 'beta',
    profileLayout: layout,
    cv: adapted,
    baseCv: base,
  });
  const blocks = preview.layout.pages[0].blocks;
  const bullet = blocks.find((block) => block.id === 'bullet');
  assert.equal(bullet.content, '• Pilotage des quotas et de la qualité terrain.');
  assert.equal(blocks.some((block) => block.id === 'line-b'), false);
  const resume = blocks.find((block) => block.id === 'line-a');
  assert.equal(resume.content, 'Consultant qui relie les études quantitatives aux décisions marketing.');
  assert.ok(resume.h > 5);
  assert.equal(blocks.some((block) => block.id === 'rule'), true);
  assert.equal(layout.pages[0].blocks[0].content, '• Suivi des quotas sur les marchés.');
  const htmlLayout = {
    pages: [{
      blocks: [{
        id: 'resume-html',
        type: 'text',
        x: 20,
        y: 10,
        w: 160,
        h: 20,
        content: 'Consultant qui pilote des études<br>quantitatives pour des marques.',
      }],
    }],
  };
  const fromHtml = resolveBetaCanvasPreview({
    templateId: 'beta',
    profileLayout: htmlLayout,
    cv: { resume: 'Consultant qui relie les études aux décisions marketing.' },
    baseCv: { resume: 'Consultant qui pilote des études quantitatives pour des marques.' },
  });
  assert.equal(
    fromHtml.layout.pages[0].blocks[0].content,
    'Consultant qui relie les études aux décisions marketing.',
  );
  const same = resolveBetaCanvasPreview({
    templateId: 'beta',
    profileLayout: layout,
    cv: base,
    baseCv: base,
  });
  assert.equal(same.layout, layout);
});

test('resolveBetaCanvasPreview surligne les mots modifiés', () => {
  const layout = {
    pages: [{
      blocks: [{
        id: 'bullet',
        type: 'text',
        x: 20,
        y: 40,
        w: 150,
        h: 6,
        content: '• Suivi des quotas sur les marchés.',
      }],
    }],
  };
  const preview = resolveBetaCanvasPreview({
    templateId: 'beta',
    profileLayout: layout,
    cv: { experiences: [{ bullet_points: ['Pilotage des quotas et de la qualité terrain.'] }] },
    baseCv: { experiences: [{ bullet_points: ['Suivi des quotas sur les marchés.'] }] },
    highlightChanges: true,
  });
  const content = preview.layout.pages[0].blocks[0].content;
  assert.match(content, /^• /);
  assert.match(content, /<span class="cv-changed">Pilotage<\/span>/);
  assert.match(content, /des quotas/);
  assert.match(content, /<span class="cv-changed">/);
  assert.equal(layout.pages[0].blocks[0].content, '• Suivi des quotas sur les marchés.');
});

test('un titre adapté ne déplace pas les autres lignes', () => {
  const layout = {
    pages: [{
      blocks: [
        {
          id: 'title',
          type: 'text',
          x: 20,
          y: 20,
          w: 40,
          h: 5,
          content: 'Etudiant ESSEC',
          style: { font_size: 11, nowrap: true },
        },
        {
          id: 'city',
          type: 'text',
          x: 20,
          y: 24,
          w: 50,
          h: 5,
          content: 'Région parisienne',
        },
      ],
    }],
  };
  const preview = projectCvDeltaOntoLayout(
    layout,
    { titre_professionnel: 'Etudiant ESSEC' },
    { titre_professionnel: 'Tech Lead data chez Michelin à Lyon' },
  );
  const blocks = preview.pages[0].blocks;
  const city = blocks.find((block) => block.id === 'city');
  const title = blocks.find((block) => block.id === 'title');
  assert.equal(city.y, 24);
  assert.equal(title.y, 20);
  assert.equal(title.h, 5);
  assert.equal(title.previewField, 'titre');
  assert.equal(layout.pages[0].blocks[1].y, 24);
});

test('un titre long garde la taille et la police du bloc', () => {
  const layout = {
    pages: [{
      blocks: [
        {
          id: 'title',
          type: 'text',
          x: 20,
          y: 20,
          w: 30,
          h: 5,
          content: 'Etudiant',
          style: { font_size: 11, nowrap: true },
        },
        {
          id: 'city',
          type: 'text',
          x: 20,
          y: 40,
          w: 50,
          h: 5,
          content: 'Région parisienne',
        },
      ],
    }],
  };
  const preview = projectCvDeltaOntoLayout(
    layout,
    { titre_professionnel: 'Etudiant' },
    { titre_professionnel: 'Tech Lead data ops' },
  );
  const title = preview.pages[0].blocks.find((block) => block.id === 'title');
  const city = preview.pages[0].blocks.find((block) => block.id === 'city');
  assert.equal(title.w, 30);
  assert.equal(title.h, 5);
  assert.equal(title.style.font_size, 11);
  assert.equal(title.style.nowrap, true);
  assert.equal(city.y, 40);
  assert.equal(preview.previewConflicts, undefined);
});

test('un titre long reste dans son cadre d’origine', () => {
  const longTitle = 'Tech Lead data operations Michelin Lyon Paris remote';
  const layout = {
    pages: [{
      blocks: [
        {
          id: 'title',
          type: 'text',
          x: 20,
          y: 20,
          w: 28,
          h: 5,
          content: 'Etudiant ESSEC',
          style: { font_size: 11, nowrap: true },
        },
        {
          id: 'date',
          type: 'text',
          x: 55,
          y: 20,
          w: 30,
          h: 5,
          content: '2024',
        },
        {
          id: 'city',
          type: 'text',
          x: 20,
          y: 24,
          w: 50,
          h: 5,
          content: 'Région parisienne',
        },
      ],
    }],
  };
  const preview = projectCvDeltaOntoLayout(
    layout,
    { titre_professionnel: 'Etudiant ESSEC' },
    { titre_professionnel: longTitle },
  );
  const title = preview.pages[0].blocks.find((block) => block.id === 'title');
  const city = preview.pages[0].blocks.find((block) => block.id === 'city');
  const date = preview.pages[0].blocks.find((block) => block.id === 'date');
  assert.equal(city.y, 24);
  assert.equal(date.x, 55);
  assert.equal(title.w, 28);
  assert.equal(title.h, 5);
  assert.equal(title.style.font_size, 11);
  assert.equal(title.style.preview_clip, undefined);
  assert.equal(preview.previewConflicts, undefined);
  assert.match(String(title.content), /Tech Lead data operations Michelin Lyon Paris remote/);
});

test('applyCanvasFitText remplace le titre', () => {
  const next = applyCanvasFitText(
    { titre_professionnel: 'Trop long', experiences: [{ poste: 'A' }] },
    'titre',
    'Court',
  );
  assert.equal(next.titre_professionnel, 'Court');
  assert.equal(next.experiences[0].poste, 'A');
});

test('betaCanvasRenderFields', () => {
  const layout = { pages: [{ blocks: [{ id: 'a', type: 'text', x: 0, y: 0, w: 10, h: 10 }] }] };
  assert.deepEqual(betaCanvasRenderFields('minimal', layout), {});
  assert.deepEqual(betaCanvasRenderFields('beta', null), {});
  assert.deepEqual(betaCanvasRenderFields('beta', layout), { layout });
  const painted = {
    pages: [{
      blocks: [{
        id: 'a',
        type: 'text',
        x: 0,
        y: 0,
        w: 80,
        h: 8,
        content: 'Suivi des quotas sur les marchés.',
      }],
    }],
  };
  const rendered = betaCanvasRenderFieldsForCv(
    'beta',
    painted,
    { experiences: [{ bullet_points: ['Suivi des quotas sur les marchés.'] }] },
    { experiences: [{ bullet_points: ['Pilotage des quotas terrain.'] }] },
  );
  assert.equal(rendered.layout.pages[0].blocks[0].content, 'Pilotage des quotas terrain.');
  assert.equal(painted.pages[0].blocks[0].content, 'Suivi des quotas sur les marchés.');
});

test('le journal avant/après distingue le titre peint du corps Canva ignoré', () => {
  const layout = {
    pages: [{
      blocks: [
        { id: 'title', type: 'text', x: 20, y: 8, w: 40, h: 5, content: 'ALTERNANT' },
        {
          id: 'body',
          type: 'text',
          x: 20,
          y: 40,
          w: 150,
          h: 8,
          content: 'Harris Interactive conception de questionnaires quantitatifs.',
        },
      ],
    }],
  };
  const logs = [];
  const original = console.info;
  console.info = (...args) => { logs.push(args); };
  try {
    const preview = projectCvDeltaOntoLayout(
      layout,
      { titre_professionnel: 'ALTERNANT', resume: '', experiences: [] },
      {
        titre_professionnel: 'Étudiant ESSEC - Président de la République',
        resume: 'Étudiant ESSEC, intérêt pour les institutions publiques.',
        experiences: [],
      },
    );
    const title = preview.pages[0].blocks.find((block) => block.id === 'title');
    const body = preview.pages[0].blocks.find((block) => block.id === 'body');
    assert.match(title.content, /Président/);
    assert.match(body.content, /Harris Interactive/);
  } finally {
    console.info = original;
  }
  const report = logs.find((args) => args[0] === '[beta-canvas] avant/après')?.[1];
  assert.ok(report);
  assert.equal(report.changed.find((row) => row.key === 'titre').onCanvas, true);
  assert.equal(report.added.some((row) => row.key === 'resume'), true);
  assert.equal(report.structuredExperiences, 0);
  assert.ok(report.canvasTextBlocks >= 1);
  assert.ok(logs.some((args) => String(args[0]).includes('experiences vide')));
});

test('un texte adapté trop long est signalé sans déplacer les blocs', () => {
  const layout = {
    pages: [{
      blocks: [
        {
          id: 'resume',
          type: 'text',
          x: 80,
          y: 8,
          w: 100,
          h: 22,
          content: '<span class="cv-changed">Étudiant ESSEC en troisième année, je mobilise ma rigueur pour les missions de haute responsabilité.</span>',
        },
        { id: 'chip', type: 'text', x: 110, y: 12, w: 22, h: 4, content: 'organisation' },
        { id: 'city', type: 'text', x: 20, y: 16, w: 40, h: 5, content: 'Région parisienne' },
        { id: 'skill', type: 'text', x: 8, y: 48, w: 28, h: 5, content: 'Rigueur' },
        {
          id: 'bullet',
          type: 'text',
          x: 80,
          y: 40,
          w: 90,
          h: 16,
          content: '<span class="cv-changed">Conception de questionnaires et analyse de données quantitatives pour des clients.</span>',
        },
        { id: 'dot', type: 'text', x: 72, y: 40, w: 4, h: 4, content: '•' },
        { id: 'next', type: 'text', x: 80, y: 48, w: 90, h: 8, content: 'Suite du poste' },
      ],
    }],
  };
  const out = flagCanvasOverlaps(layout);
  const byId = Object.fromEntries(out.pages[0].blocks.map((block) => [block.id, block]));
  assert.equal(byId.chip.y, 12);
  assert.equal(byId.city.y, 16);
  assert.equal(byId.skill.y, 48);
  assert.equal(byId.dot.y, 40);
  assert.equal(byId.next.y, 48);
  assert.ok(out.previewConflicts.some((row) => row.hostId === 'resume' && row.otherId === 'chip'));
  assert.ok(out.previewConflicts.some((row) => row.hostId === 'bullet' && row.otherId === 'next'));
  assert.equal(out.previewConflicts.some((row) => row.otherId === 'city'), false);
  assert.equal(out.previewConflicts.some((row) => row.otherId === 'skill'), false);
});
