/**
 * Template virtuel « Beta » = design canvas libre du profil (AXE-374).
 * Pas un dossier templates/ — le rendu passe par `layout` (layout_renderer).
 */

import { isEmptyLayoutV3 } from './cvLayoutModelV3.js';

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
 * @param {unknown[]} templates
 * @returns {object[]}
 */
export function withBetaCanvasTemplate(templates) {
  const list = Array.isArray(templates) ? templates.filter(Boolean) : [];
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
 * Aperçu `/app/cv` : même canvas que l'éditeur Beta, pas le HTML des templates Stable.
 * @param {{ betaMode?: boolean, templateId?: unknown, profileLayout?: object|null, cv?: object|null }} input
 * @returns {{ layout: object, cv: object } | null}
 */
export function resolveBetaCanvasPreview({
  betaMode = false,
  templateId,
  profileLayout,
  cv,
} = {}) {
  if (!cv || typeof cv !== 'object') return null;
  const wantsBetaLook = Boolean(betaMode) || isBetaCanvasTemplateId(templateId);
  if (!wantsBetaLook) return null;
  const layout = hasUsableBetaCanvasLayout(cv.layout) ? cv.layout : profileLayout;
  if (!hasUsableBetaCanvasLayout(layout)) return null;
  return { layout, cv };
}
