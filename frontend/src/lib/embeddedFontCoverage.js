/** Une police PDF n'est utilisée que si elle dessine tout le texte affiché. */

import { decodeStructuralText } from './structuralSemanticBind.js';

const CSS_WEIGHTS = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);

function familyNames(stack) {
  return String(stack || '')
    .split(',')
    .map((name) => name.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function requestedWeight(style = {}) {
  const weight = Number(style.font_weight);
  if (CSS_WEIGHTS.has(weight)) return weight;
  if (style.bold) return 700;
  return 400;
}

function requestedItalic(style = {}) {
  return Boolean(style.italic || style.font_style === 'italic');
}

/**
 * Une graisse par passage. ``<strong>`` et ``font-weight`` ne doivent pas être
 * vérifiés avec la graisse du bloc : le sous-ensemble gras n'a pas les mêmes lettres.
 */
function weightRuns(html, style) {
  const baseWeight = requestedWeight(style);
  const baseItalic = requestedItalic(style);
  const source = String(html || '');
  if (!source.includes('<')) {
    return [{ weight: baseWeight, italic: baseItalic, text: decodeStructuralText(source) }];
  }
  const runs = [];
  let weight = baseWeight;
  let italic = baseItalic;
  const weightStack = [];
  const italicStack = [];
  const re = /<(\/?)(strong|b|em|i|span)\b([^>]*)>|([^<]+)|<[^>]*>/gi;
  let match;
  while ((match = re.exec(source))) {
    if (match[4]) {
      runs.push({ weight, italic, text: decodeStructuralText(match[4]) });
      continue;
    }
    if (!match[2]) continue;
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    if (closing) {
      if (tag === 'strong' || tag === 'b') weight = weightStack.pop() ?? baseWeight;
      else if (tag === 'em' || tag === 'i') italic = italicStack.pop() ?? baseItalic;
      else if (tag === 'span') {
        weight = weightStack.pop() ?? baseWeight;
        italic = italicStack.pop() ?? baseItalic;
      }
      continue;
    }
    if (tag === 'strong' || tag === 'b') {
      weightStack.push(weight);
      weight = 700;
    } else if (tag === 'em' || tag === 'i') {
      italicStack.push(italic);
      italic = true;
    } else if (tag === 'span') {
      weightStack.push(weight);
      italicStack.push(italic);
      const weightMatch = /font-weight:\s*(bold|normal|\d+)/i.exec(match[3] || '');
      const rawWeight = (weightMatch?.[1] || '').toLowerCase();
      const nextWeight = rawWeight === 'bold' ? 700 : rawWeight === 'normal' ? 400 : Number(rawWeight);
      if (CSS_WEIGHTS.has(nextWeight)) weight = nextWeight;
      if (/font-style:\s*italic/i.test(match[3] || '')) italic = true;
    }
  }
  return runs;
}

const BULLET_CHARS = new Set(['•', '●', '○', '◦', '▪', '■', '‣', '▸', '∙', '·']);

function faceCovers(face, text) {
  return ![...String(text || '')].some((ch) => (
    ch.trim()
    && !BULLET_CHARS.has(ch)
    && !face.coverage.includes(ch)
  ));
}

function uprightStack(stack) {
  return String(stack || '')
    .split(',')
    .map((name, index) => {
      const clean = name.trim().replace(/^['"]|['"]$/g, '');
      if (!clean || index > 0) return name.trim();
      return `'${clean}__up'`;
    })
    .join(', ');
}

function synthesisFamily(stack, weight) {
  return String(stack || '')
    .split(',')
    .map((name, index) => {
      const clean = name.trim().replace(/^['"]|['"]$/g, '');
      if (!clean || index > 0) return name.trim();
      return `'${clean}__w${weight}'`;
    })
    .join(', ');
}

const LIGHTER_WEIGHTS = [400, 500, 600];

/**
 * Retire ``font_family`` quand aucune face de la famille ne contient les lettres.
 * Si le gras embarqué ne les contient pas, on épaissit le romain de la même
 * police : le bouton Gras ne doit pas changer de police.
 * Un italique incomplet incline ce romain, plutôt que de mélanger les lettres.
 */
export function fontStyleForText(style, text, fonts) {
  if (!style || typeof style !== 'object' || !style.font_family) return style || {};
  const sample = String(text || '');
  if (!sample.trim()) return style;
  const names = familyNames(style.font_family);
  const list = Array.isArray(fonts) ? fonts : [];
  const usable = list.filter((item) => (
    item
    && names.includes(item.family)
    && typeof item.coverage === 'string'
    && item.coverage.length > 0
  ));
  if (!usable.length) return style;
  const faceFor = (weight, italic) => usable.find((item) => (
    Number(item.weight) === weight
    && (item.style === 'italic') === italic
  ));
  const coveredBy = (weight, italic, value) => {
    const face = faceFor(weight, italic);
    return Boolean(face) && faceCovers(face, value);
  };
  let synthesizeItalic = false;
  let synthFrom = null;
  const runs = weightRuns(sample, style);
  for (const run of runs) {
    const value = String(run.text || '');
    if (!value.trim()) continue;
    if (coveredBy(run.weight, run.italic, value)) continue;
    if (run.italic && coveredBy(run.weight, false, value)) {
      synthesizeItalic = true;
      continue;
    }
    const lighter = LIGHTER_WEIGHTS.find((weight) => (
      weight < run.weight && coveredBy(weight, false, value)
    ));
    if (lighter) {
      synthFrom = lighter;
      continue;
    }
    const next = { ...style };
    delete next.font_family;
    return next;
  }
  if (synthFrom) {
    const everything = runs.map((run) => run.text).join('');
    if (!coveredBy(synthFrom, false, everything)) {
      const next = { ...style };
      delete next.font_family;
      return next;
    }
    return { ...style, font_family: synthesisFamily(style.font_family, synthFrom) };
  }
  if (!synthesizeItalic) return style;
  return { ...style, font_family: uprightStack(style.font_family) };
}
