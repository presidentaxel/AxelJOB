/**
 * Template virtuel « Beta » = design canvas libre du profil (AXE-374).
 * Pas un dossier templates/ — le rendu passe par `layout` (layout_renderer).
 */

import { isEmptyLayoutV3 } from './cvLayoutModelV3.js';
import { diffHighlightHtml } from './cvChangeHighlight.js';
import {
  BIND_MODE_ABSORB,
  bindStructuralTextToSemanticBlocks,
  decodeStructuralText,
  stripPdfMarkup,
} from './structuralSemanticBind.js';

export const BETA_CANVAS_TEMPLATE_ID = 'beta';

export const BETA_CANVAS_TEMPLATE = {
  id: BETA_CANVAS_TEMPLATE_ID,
  name: 'Beta',
  description:
    'Ton design de l’éditeur Beta (canvas libre). Modifie-le sur Profil en mode Beta.',
  tags: ['beta', 'canvas', 'free-canvas'],
  options: [],
};

/**
 * @param {unknown} templateId
 * @returns {boolean}
 */
export function isBetaCanvasTemplateId(templateId) {
  return String(templateId || '').trim() === BETA_CANVAS_TEMPLATE_ID;
}

/**
 * @param {unknown} layout
 * @returns {boolean}
 */
export function hasUsableBetaCanvasLayout(layout) {
  return Boolean(layout) && !isEmptyLayoutV3(layout);
}

/**
 * Injecte la carte Beta en tête de liste (idempotent).
 * En mode Stable (`includeBeta: false`), la carte est absente du choix.
 * @param {unknown[]} templates
 * @param {{ includeBeta?: boolean }} [opts]
 * @returns {object[]}
 */
export function withBetaCanvasTemplate(templates, { includeBeta = true } = {}) {
  const list = Array.isArray(templates) ? templates.filter(Boolean) : [];
  if (!includeBeta) {
    return list.filter((t) => !isBetaCanvasTemplateId(t?.id));
  }
  if (list.some((t) => isBetaCanvasTemplateId(t?.id))) {
    return list;
  }
  return [BETA_CANVAS_TEMPLATE, ...list];
}

/**
 * Champs à fusionner dans render-html / pdf quand Beta est actif.
 * @param {string|null|undefined} templateId
 * @param {object|null|undefined} layout
 * @returns {{ layout?: object }}
 */
export function betaCanvasRenderFields(templateId, layout) {
  if (!isBetaCanvasTemplateId(templateId)) return {};
  if (!hasUsableBetaCanvasLayout(layout)) return {};
  return { layout };
}

/**
 * Layout envoyé à render-html / pdf : le texte figé suit le CV adapté.
 * @param {string|null|undefined} templateId
 * @param {object|null|undefined} layout
 * @param {object|null|undefined} baseCv
 * @param {object|null|undefined} nextCv
 * @returns {{ layout?: object }}
 */
export function betaCanvasRenderFieldsForCv(templateId, layout, baseCv, nextCv) {
  const fields = betaCanvasRenderFields(templateId, layout);
  if (!fields.layout) return {};
  const projected = flagCanvasOverlaps(
    previewLayoutForAdaptedCv(fields.layout, baseCv, nextCv),
  );
  if (!projected?.pages) return {};
  const { previewConflicts: _previewConflicts, ...rest } = projected;
  return {
    layout: {
      ...rest,
      pages: rest.pages.map((page) => ({
        ...page,
        blocks: (page.blocks || []).map((block) => {
          if (!block?.style?.preview_clip && !block?.previewField) return block;
          const { previewField: _previewField, ...restBlock } = block;
          if (!restBlock.style?.preview_clip) return restBlock;
          const { preview_clip: _previewClip, ...style } = restBlock.style;
          return { ...restBlock, style };
        }),
      })),
    },
  };
}

/**
 * CV affiché dans l’aperçu canvas : adapté, sinon traduction de langue, sinon profil.
 * La photo reprend l’URL signée fraîche quand elle est connue.
 * @param {{ previewVariant?: string, lastAdaptedCv?: object|null, lastBaseCv?: object|null, localizedCv?: object|null, freshPreviewPhotoUrl?: string|null }} input
 * @returns {object|null}
 */
export function resolveBetaPreviewCv({
  previewVariant,
  lastAdaptedCv,
  lastBaseCv,
  localizedCv,
  freshPreviewPhotoUrl,
} = {}) {
  const cv = previewVariant === 'modified' && lastAdaptedCv
    ? lastAdaptedCv
    : (previewVariant === 'modified' && localizedCv ? localizedCv : lastBaseCv);
  if (!cv || typeof cv !== 'object') return null;
  if (freshPreviewPhotoUrl !== undefined) {
    return { ...cv, photo_url: freshPreviewPhotoUrl };
  }
  return cv;
}

const MIN_EXACT_LEN = 4;
const MIN_SEQUENCE_LEN = 24;
const LEADING_MARK_RE = /^[\s]*([•·▪‣●◦*-])\s+/u;

function normText(value) {
  const withBreaks = String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ');
  return decodeStructuralText(stripPdfMarkup(withBreaks))
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/^[\s•·▪‣●◦\-*]+/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function textToPreviewHtml(oldContent, newValue, { highlight = false, oldValue = '' } = {}) {
  const plain = decodeStructuralText(stripPdfMarkup(oldContent));
  const mark = LEADING_MARK_RE.exec(plain);
  const next = String(newValue || '').trim();
  const body = highlight
    ? diffHighlightHtml(String(oldValue || '').trim(), next)
    : escapeHtml(next).replace(/\n/g, '<br>');
  if (mark && !LEADING_MARK_RE.test(next)) return `${escapeHtml(mark[1])} ${body}`;
  return body;
}

function putField(map, key, value) {
  if (typeof value !== 'string') return;
  if (normText(value).length < MIN_EXACT_LEN) return;
  map.set(key, value);
}

function collectKeyedText(cv) {
  const map = new Map();
  if (!cv || typeof cv !== 'object') return map;
  putField(map, 'resume', cv.resume);
  putField(map, 'titre', cv.titre_professionnel);
  const fullName = [cv.prenom, cv.nom].filter((part) => typeof part === 'string' && part.trim()).join(' ');
  putField(map, 'identite', fullName);
  const experiences = Array.isArray(cv.experiences) ? cv.experiences : [];
  experiences.forEach((exp, i) => {
    if (!exp || typeof exp !== 'object') return;
    putField(map, `exp.${i}.poste`, exp.poste);
    putField(map, `exp.${i}.entreprise`, exp.entreprise);
    putField(map, `exp.${i}.description`, exp.description);
    const bullets = Array.isArray(exp.bullet_points) ? exp.bullet_points : [];
    bullets.forEach((bullet, j) => putField(map, `exp.${i}.b.${j}`, bullet));
  });
  const formations = Array.isArray(cv.formations) ? cv.formations : [];
  formations.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    putField(map, `form.${i}.diplome`, item.diplome);
    putField(map, `form.${i}.etablissement`, item.etablissement);
    putField(map, `form.${i}.description`, item.description);
  });
  return map;
}

function changedTextPairs(baseCv, nextCv) {
  const base = collectKeyedText(baseCv);
  const next = collectKeyedText(nextCv);
  const pairs = [];
  for (const [key, oldVal] of base) {
    if (!next.has(key)) continue;
    const newVal = next.get(key);
    const oldNorm = normText(oldVal);
    if (!oldNorm || oldNorm === normText(newVal)) continue;
    pairs.push({ key, oldVal, newVal, oldNorm });
  }
  pairs.sort((a, b) => b.oldNorm.length - a.oldNorm.length);
  return pairs;
}

function clipAdaptLog(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (/(?:\+?\d[\d\s.-]{7,}\d)/.test(text)) return '[contact]';
  if (!text) return '∅';
  return text.length > 90 ? `${text.slice(0, 89)}…` : text;
}

function canvasTextBlockCount(layout) {
  let count = 0;
  for (const page of layout?.pages || []) {
    for (const block of page.blocks || []) {
      if (block?.type !== 'text' && block?.type !== 'title') continue;
      if (normText(block.content).length >= 12) count += 1;
    }
  }
  return count;
}

let lastCanvasProjectionLog = '';

/**
 * Journal avant/après : quels champs structurés ont bougé, et lesquels
 * ont trouvé un bloc sur le canvas. Un résumé ajouté (source vide) ou un
 * corps Canva sans experiences ne peut pas être peint.
 */
function reportCanvasProjection({ pairs, paintedKeys, layout, baseCv, nextCv }) {
  const baseKeys = collectKeyedText(baseCv);
  const nextKeys = collectKeyedText(nextCv);
  const added = [];
  for (const [key, value] of nextKeys) {
    if (!baseKeys.has(key)) added.push({ key, after: clipAdaptLog(value) });
  }
  const changed = (pairs || []).map((pair) => ({
    key: pair.key,
    before: clipAdaptLog(pair.oldVal),
    after: clipAdaptLog(pair.newVal),
    onCanvas: paintedKeys.has(pair.key),
  }));
  if (!changed.length && !added.length) return;
  const canvasTextBlocks = canvasTextBlockCount(layout);
  const structuredExperiences = Array.isArray(nextCv?.experiences) ? nextCv.experiences.length : 0;
  const report = { changed, added, canvasTextBlocks, structuredExperiences };
  const signature = JSON.stringify(report);
  if (signature === lastCanvasProjectionLog) return;
  lastCanvasProjectionLog = signature;
  console.info('[beta-canvas] avant/après', report);
  if (structuredExperiences === 0 && canvasTextBlocks > 0) {
    console.info(
      '[beta-canvas] experiences vide : le corps Canva (%s blocs) reste le texte d’origine',
      canvasTextBlocks,
    );
  }
}

function unionBox(blocks) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const block of blocks) {
    const x = Number(block.x) || 0;
    const y = Number(block.y) || 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + (Number(block.w) || 0));
    maxY = Math.max(maxY, y + (Number(block.h) || 0));
  }
  return {
    x: minX,
    y: minY,
    w: Math.max(8, maxX - minX),
    h: Math.max(6, maxY - minY),
  };
}

function plainOf(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function lineBoxMm(fontPt) {
  return Math.max(3.2, fontPt * 0.3528 * 1.35);
}

function charsPerLine(widthMm, fontPt) {
  const charMm = Math.max(1.35, fontPt * 0.3528 * 0.5);
  return Math.max(8, Math.floor(Math.max(8, widthMm - 1) / charMm));
}

/**
 * Le texte adapté reste dans le bloc d'origine : même largeur, même hauteur,
 * même police. S'il déborde, `flagCanvasOverlaps` le signale.
 */
function fitChangedTextBlocks() {
  // Largeur, hauteur et police du bloc restent celles du Canva.
}

function findTextSequence(entries, oldNorm, used) {
  const sorted = entries
    .filter((entry) => !used.has(entry.block.id) && entry.plain)
    .sort((a, b) => (
      a.pageIndex - b.pageIndex
      || (Number(a.block.y) || 0) - (Number(b.block.y) || 0)
      || (Number(a.block.x) || 0) - (Number(b.block.x) || 0)
    ));
  for (let i = 0; i < sorted.length; i += 1) {
    if (!oldNorm.startsWith(sorted[i].plain)) continue;
    const seq = [sorted[i]];
    let acc = sorted[i].plain;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const prev = seq[seq.length - 1];
      const nxt = sorted[j];
      if (nxt.pageIndex !== prev.pageIndex) break;
      const prevBottom = (Number(prev.block.y) || 0) + (Number(prev.block.h) || 0);
      const dy = (Number(nxt.block.y) || 0) - prevBottom;
      if (dy > 8) break;
      const dx = Math.abs((Number(nxt.block.x) || 0) - (Number(prev.block.x) || 0));
      if (dx > 18) continue;
      const candidate = `${acc} ${nxt.plain}`;
      if (candidate !== oldNorm && !oldNorm.startsWith(candidate)) break;
      seq.push(nxt);
      acc = candidate;
      if (acc === oldNorm) return seq;
    }
  }
  return null;
}

/**
 * Le canvas Beta fige le texte dans les blocs `text` / `title`.
 * L'adaptation réécrit `resume` et `bullet_points` : on reporte ces chaînes
 * sur les blocs qui affichaient l'ancien texte, sans toucher au design.
 * @param {object} layout
 * @param {object|null|undefined} baseCv
 * @param {object|null|undefined} nextCv
 * @returns {object}
 */
export function projectCvDeltaOntoLayout(layout, baseCv, nextCv, { highlight = false } = {}) {
  if (!layout?.pages?.length || !baseCv || !nextCv) return layout;
  const pairs = changedTextPairs(baseCv, nextCv);
  if (!pairs.length) {
    reportCanvasProjection({
      pairs,
      paintedKeys: new Set(),
      layout,
      baseCv,
      nextCv,
    });
    return layout;
  }

  const pages = layout.pages.map((page, pageIndex) => ({
    ...page,
    blocks: (page.blocks || []).map((block, blockIndex) => ({
      ...block,
      id: block?.id || `preview-${pageIndex}-${blockIndex}`,
      style: block?.style && typeof block.style === 'object' ? { ...block.style } : block?.style,
    })),
  }));
  const entries = [];
  pages.forEach((page, pageIndex) => {
    (page.blocks || []).forEach((block) => {
      if (block.type !== 'text' && block.type !== 'title') return;
      const plain = normText(block.content);
      if (!plain) return;
      entries.push({ pageIndex, block, plain });
    });
  });
  if (!entries.length) return layout;

  const used = new Set();
  const remove = new Set();
  const paintedKeys = new Set();
  let changed = false;
  for (const pair of pairs) {
    let exact = false;
    for (const entry of entries) {
      if (used.has(entry.block.id)) continue;
      const containsField = pair.oldNorm.length >= 12 && entry.plain.includes(pair.oldNorm);
      if (entry.plain !== pair.oldNorm && !containsField) continue;
      entry.block.content = textToPreviewHtml(entry.block.content, pair.newVal, {
        highlight,
        oldValue: pair.oldVal,
      });
      entry.block.previewField = pair.key;
      used.add(entry.block.id);
      paintedKeys.add(pair.key);
      exact = true;
      changed = true;
    }
    if (exact || pair.oldNorm.length < MIN_SEQUENCE_LEN) continue;
    const seq = findTextSequence(entries, pair.oldNorm, used);
    if (!seq || seq.length < 2) continue;
    const first = seq[0].block;
    const box = unionBox(seq.map((entry) => entry.block));
    first.x = box.x;
    first.y = box.y;
    first.w = box.w;
    first.h = box.h;
    first.content = textToPreviewHtml(first.content, pair.newVal, {
      highlight,
      oldValue: pair.oldVal,
    });
    first.style = { ...(first.style || {}), nowrap: false, lock_height: false };
    first.previewField = pair.key;
    used.add(first.id);
    paintedKeys.add(pair.key);
    for (const extra of seq.slice(1)) {
      used.add(extra.block.id);
      remove.add(extra.block.id);
    }
    changed = true;
  }
  reportCanvasProjection({ pairs, paintedKeys, layout, baseCv, nextCv });
  if (!changed) return layout;
  fitChangedTextBlocks(pages, used, remove);
  return {
    ...layout,
    pages: pages.map((page) => ({
      ...page,
      blocks: page.blocks.filter((block) => !remove.has(block.id)),
    })),
  };
}

/**
 * Aperçu adapté : d'abord le texte figé, sinon les zones PDF deviennent
 * des blocs liés au CV (le rendu lit alors le CV adapté).
 */
function previewLayoutForAdaptedCv(layout, baseCv, nextCv, options) {
  const projected = projectCvDeltaOntoLayout(layout, baseCv, nextCv, options);
  if (projected !== layout) return projected;
  if (!changedTextPairs(baseCv, nextCv).length) return layout;
  const bound = bindStructuralTextToSemanticBlocks(layout, baseCv, {
    mode: BIND_MODE_ABSORB,
  });
  if (!bound?.boundCount || !bound.layout) return layout;
  return bound.layout;
}

function blockBox(block) {
  const x = Number(block?.x) || 0;
  const y = Number(block?.y) || 0;
  const w = Math.max(0.4, Number(block?.w) || 0);
  const h = Math.max(0.4, Number(block?.h) || 0);
  return { x, y, w, h, r: x + w, b: y + h };
}

function isAdaptedBlock(block) {
  return /cv-changed/.test(String(block?.content || '')) || Boolean(block?.previewField);
}

function occupiedBox(block) {
  const box = blockBox(block);
  if (!isAdaptedBlock(block)) return box;
  const html = String(block.content || '');
  const text = plainOf(html);
  if (!text) return box;
  // Le <br> est la ligne d'origine : on ne recalcule pas une hauteur de paragraphe.
  if (/<br\s*\/?>/i.test(html)) return box;
  const font = Number(block.style?.font_size) || (block.type === 'title' ? 13 : 10);
  const perLine = charsPerLine(box.w, font);
  const lines = Math.max(1, Math.ceil(text.length / perLine));
  const h = Math.max(box.h, lines * lineBoxMm(font));
  return { ...box, h, b: box.y + h };
}

function blocksOverlap(host, other) {
  const a = occupiedBox(host);
  const b = blockBox(other);
  const overlapW = Math.min(a.r, b.r) - Math.max(a.x, b.x);
  const overlapH = Math.min(a.b, b.b) - Math.max(a.y, b.y);
  if (overlapW < 3 || overlapH < 1.5) return false;
  if (Math.abs(a.y - b.y) <= 2.5) return false;
  return true;
}

/**
 * L'adaptation ne déplace aucun bloc. Si le nouveau texte recouvre
 * un autre élément, on le signale pour que le CV soit vérifié.
 * @returns {object}
 */
export function flagCanvasOverlaps(layout) {
  if (!layout?.pages) return layout;
  const conflicts = [];
  for (const page of layout.pages) {
    const blocks = (page.blocks || []).filter((block) => {
      if (!block) return false;
      if (block.type === 'text' || block.type === 'title') return plainOf(block.content).length > 0;
      return false;
    });
    for (const host of blocks) {
      if (!isAdaptedBlock(host)) continue;
      for (const other of blocks) {
        if (other === host) continue;
        if (!blocksOverlap(host, other)) continue;
        conflicts.push({ hostId: host.id, otherId: other.id });
        break;
      }
    }
  }
  if (!conflicts.length) return layout;
  return { ...layout, previewConflicts: conflicts };
}

/**
 * Aperçu `/app/cv` : le canvas Beta seulement quand le template choisi est Beta.
 * Un template classique (minimal, classic, …) garde son HTML, même si le mode Beta est actif.
 * Si le CV affiché est une adaptation, le texte figé du canvas est aligné dessus.
 * @param {{ templateId?: unknown, profileLayout?: object|null, cv?: object|null, baseCv?: object|null }} input
 * @returns {{ layout: object, cv: object } | null}
 */
export function resolveBetaCanvasPreview({
  templateId,
  profileLayout,
  cv,
  baseCv = null,
  highlightChanges = false,
} = {}) {
  if (!cv || typeof cv !== 'object') return null;
  if (!isBetaCanvasTemplateId(templateId)) return null;
  const source = hasUsableBetaCanvasLayout(cv.layout) ? cv.layout : profileLayout;
  if (!hasUsableBetaCanvasLayout(source)) return null;
  const projected = flagCanvasOverlaps(
    previewLayoutForAdaptedCv(source, baseCv, cv, { highlight: highlightChanges }),
  );
  if (!projected) return null;
  const conflicts = Array.isArray(projected.previewConflicts) ? projected.previewConflicts : [];
  if (!conflicts.length) return { layout: projected, cv, conflicts };
  const { previewConflicts: _previewConflicts, ...layout } = projected;
  return { layout, cv, conflicts };
}

/** Remplace un champ du CV adapté par un texte raccourci (clé de projection). */
export function applyCanvasFitText(cv, key, text) {
  if (!cv || typeof cv !== 'object' || !key || typeof text !== 'string') return cv;
  if (key === 'resume') return { ...cv, resume: text };
  if (key === 'titre') return { ...cv, titre_professionnel: text };
  const expMatch = /^exp\.(\d+)\.(poste|entreprise|description|b)\.?(\d+)?$/.exec(key);
  if (expMatch && Array.isArray(cv.experiences)) {
    const index = Number(expMatch[1]);
    const experiences = cv.experiences.map((exp, i) => {
      if (i !== index || !exp) return exp;
      if (expMatch[2] === 'b') {
        const bullets = [...(exp.bullet_points || [])];
        bullets[Number(expMatch[3])] = text;
        return { ...exp, bullet_points: bullets };
      }
      return { ...exp, [expMatch[2]]: text };
    });
    return { ...cv, experiences };
  }
  return cv;
}
