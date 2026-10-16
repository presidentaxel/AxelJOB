/**
 * AXE-329 — lie les blocs texte freeform d'un import structurel PDF
 * vers des types sémantiques éditables (identity, experiences, …).
 *
 * Heuristique pure (pas d'IA) : confiance basse → le bloc reste `text`.
 *
 * Deux modes :
 * - `inPlace` (défaut, import design) : même géométrie/typo PDF ; titres → `title` ;
 *   identité/contact bindés étroitement. Le corps n’est pas fusionné.
 * - `absorb` : ancien AXE-329 (région titre→corps → un widget sémantique).
 */

import { createCvSectionBlockPreset } from './canvasCvSectionPresets.js';

export const MIN_SEMANTIC_CONFIDENCE = 0.75;

/** Patterns titres : ligne entière ≈ libellé de section (évite faux positifs corps). */
const SECTION_HEADING_RULES = Object.freeze([
  {
    type: 'experiences',
    re: /^(?:[\s|/·•\-–—]*)((?:work|professional)\s+experiences?|exp[ée]riences?(?:\s+professionnelles?)?|work\s+history|employment)\s*[:.]?\s*$/i,
  },
  {
    type: 'formations',
    re: /^(?:[\s|/·•\-–—]*)(formations?|education|études|etudes|dipl[oô]mes?)\s*[:.]?\s*$/i,
  },
  {
    type: 'skills',
    re: /^(?:[\s|/·•\-–—]*)(comp[ée]tences?|skills?|technologies?|outils?)\s*[:.]?\s*$/i,
  },
  {
    type: 'languages',
    re: /^(?:[\s|/·•\-–—]*)(langues?|languages?)\s*[:.]?\s*$/i,
  },
  {
    type: 'certifications',
    re: /^(?:[\s|/·•\-–—]*)(certifications?|accreditations?)\s*[:.]?\s*$/i,
  },
  {
    type: 'projets',
    re: /^(?:[\s|/·•\-–—]*)(projets?|projects?|réalisations?|realisations?)\s*[:.]?\s*$/i,
  },
  {
    type: 'resume',
    re: /^(?:[\s|/·•\-–—]*)(profil|r[ée]sum[ée]|summary|about|à propos|a propos)\s*[:.]?\s*$/i,
  },
  {
    type: 'contact',
    re: /^(?:[\s|/·•\-–—]*)(contact|coordonn[ée]es)\s*[:.]?\s*$/i,
  },
]);

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;

export function decodeStructuralText(content) {
  // Une seule passe : éviter le double-unescape CodeQL
  // (`&amp;lt;` ne doit pas devenir `<`).
  const decoded = String(content || '').replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    (entity) => {
      const lower = entity.toLowerCase();
      if (lower === '&nbsp;') return ' ';
      if (lower === '&amp;') return '&';
      if (lower === '&lt;') return '<';
      if (lower === '&gt;') return '>';
      if (lower === '&quot;') return '"';
      if (lower === '&#39;' || lower === '&apos;') return "'";
      const dec = /^&#(\d+);$/.exec(entity);
      if (dec) {
        const code = Number(dec[1]);
        if (code > 0 && code < 0x110000) return String.fromCharCode(code);
      }
      const hex = /^&#x([0-9a-f]+);$/i.exec(entity);
      if (hex) {
        const code = parseInt(hex[1], 16);
        if (code > 0 && code < 0x110000) return String.fromCharCode(code);
      }
      return entity;
    },
  );
  return decoded.replace(/\s+/g, ' ').trim();
}

function sameColumn(head, body) {
  // Les titres PDF ont souvent un `w` = largeur glyphes (ex. « Formation » ~35mm)
  // alors que le corps est plus large : on aligne sur le bord gauche, pas sur `w`.
  const hx = Number(head.x) || 0;
  const bx = Number(body.x) || 0;
  // Sidebar : démarre nettement à gauche du titre.
  if (bx < hx - 8) return false;
  // Même colonne : bords gauches proches, ou corps légèrement indenté sous le titre.
  return Math.abs(bx - hx) <= 14 || (bx >= hx - 2 && bx <= hx + 28);
}

function unionBox(blocks) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let z = 1;
  for (const b of blocks) {
    const x = Number(b.x) || 0;
    const y = Number(b.y) || 0;
    const w = Number(b.w) || 0;
    const h = Number(b.h) || 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    z = Math.max(z, Number(b.z) || 1);
  }
  return {
    x: minX,
    y: minY,
    w: Math.max(8, maxX - minX),
    h: Math.max(6, maxY - minY),
    z,
  };
}

/**
 * @returns {{ type: string, confidence: number, kind: string, sectionLabel?: string } | null}
 */
export function classifyStructuralTextBlock(block, cv = {}, { pageHeightMm = 297 } = {}) {
  if (!block || block.type !== 'text') return null;
  // Les balises (gras partiel, couleur) ne comptent pas dans la longueur.
  const text = decodeStructuralText(String(block.content || '').replace(/<[^>]+>/g, ' '));
  if (!text) return null;

  // Titres : ligne entière = libellé (pas un mot-clé dans une phrase corps).
  if (text.length <= 48) {
    for (const rule of SECTION_HEADING_RULES) {
      if (!rule.re.test(text)) continue;
      const bold = Boolean(block.style?.bold);
      const fontSize = Number(block.style?.font_size) || 0;
      let confidence = 0.55;
      if (bold) confidence += 0.2;
      if (fontSize >= 11) confidence += 0.15;
      if (text.length <= 32) confidence += 0.1;
      return {
        type: rule.type,
        confidence: Math.min(1, confidence),
        kind: 'heading',
        sectionLabel: text.toUpperCase(),
      };
    }
  }

  // Identité : nom/prénom CV (+ dual-key EN) + haut de page + emphase.
  // Ligne courte seulement : un bullet XP qui cite le nom ne doit pas
  // devenir un second widget identity.
  const prenom = String(cv?.prenom || cv?.first_name || '').trim().toLowerCase();
  const nom = String(cv?.nom || cv?.last_name || '').trim().toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const nameLine = text.length <= 48 && wordCount <= 6;
  if (nameLine && (prenom || nom)) {
    const lower = text.toLowerCase();
    const hasPrenom = prenom && lower.includes(prenom);
    const hasNom = nom && lower.includes(nom);
    if (hasPrenom || hasNom) {
      const y = Number(block.y) || 0;
      const fontSize = Number(block.style?.font_size) || 0;
      const bold = Boolean(block.style?.bold);
      let confidence = 0.45;
      if (y < pageHeightMm * 0.32) confidence += 0.25;
      if (fontSize >= 14 || bold) confidence += 0.2;
      if (hasPrenom && hasNom) confidence += 0.15;
      if (confidence >= MIN_SEMANTIC_CONFIDENCE) {
        return {
          type: 'identity',
          confidence: Math.min(1, confidence),
          kind: 'identity',
          bindPaths: ['prenom', 'nom'],
        };
      }
    }
  }

  // Le titre sur sa propre ligne reste du texte. Le promouvoir en second
  // widget identity le fait supprimer (un seul identity en tête de page)
  // alors que le widget du nom ne l'affiche pas.

  // Contact : email / téléphone.
  let contactConf = 0;
  if (EMAIL_RE.test(text)) contactConf += 0.55;
  if (PHONE_RE.test(text)) contactConf += 0.35;
  const cvEmail = String(cv?.email || '').trim().toLowerCase();
  if (cvEmail && text.toLowerCase().includes(cvEmail)) contactConf += 0.2;
  if (contactConf >= MIN_SEMANTIC_CONFIDENCE) {
    return { type: 'contact', confidence: Math.min(1, contactConf), kind: 'contact' };
  }

  return null;
}

export const BIND_MODE_IN_PLACE = 'inPlace';
export const BIND_MODE_ABSORB = 'absorb';

function contactBindPaths(block) {
  const text = decodeStructuralText(String(block.content || '').replace(/<[^>]+>/g, ' '));
  const paths = [];
  if (EMAIL_RE.test(text)) paths.push('email');
  if (PHONE_RE.test(text)) paths.push('telephone');
  return paths;
}

const PDF_COLOR_SPAN_RE = /<span\s+style="([^"]*)">([\s\S]*?)<\/span>/gi;

/** Fragments dont la couleur diffère de la couleur de bloc. */
export function colorRunsFromPdfHtml(html) {
  const source = String(html || '');
  const runs = [];
  let cursor = 0;
  let match;
  PDF_COLOR_SPAN_RE.lastIndex = 0;
  while ((match = PDF_COLOR_SPAN_RE.exec(source))) {
    const colorMatch = /(?:^|;)\s*color:\s*(#[0-9a-fA-F]{6})/i.exec(match[1]);
    const between = source.slice(cursor, match.index).replace(/<[^>]+>/g, '');
    cursor = PDF_COLOR_SPAN_RE.lastIndex;
    if (!colorMatch) continue;
    const text = match[2].replace(/<[^>]+>/g, '');
    const color = colorMatch[1].toLowerCase();
    const prev = runs[runs.length - 1];
    if (prev && prev.color === color && !between.trim()) prev.text += text;
    else runs.push({ text, color });
  }
  return runs.filter((run) => run.text.trim().length >= 2);
}

/** Couleur d'un champ si un fragment PDF du même texte en porte une. */
export function colorFromPdfRuns(runs, value) {
  if (!Array.isArray(runs)) return '';
  const needle = String(value || '').trim().toLowerCase();
  if (needle.length < 2) return '';
  const digits = needle.replace(/\D/g, '');
  for (const run of runs) {
    const compact = String(run?.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!compact) continue;
    if (compact.includes(needle) || (compact.length >= 3 && needle.includes(compact))) {
      return String(run.color || '');
    }
    const runDigits = compact.replace(/\D/g, '');
    if (
      digits.length >= 6
      && runDigits.length >= 6
      && (runDigits.includes(digits) || digits.includes(runDigits))
    ) {
      return String(run.color || '');
    }
  }
  return '';
}

function withPdfColorRuns(baseBlock, style) {
  const runs = colorRunsFromPdfHtml(baseBlock?.content);
  if (!runs.length) return style;
  return { ...style, color_runs: runs };
}

function preservedPdfStyle(baseBlock, extra = {}) {
  const src = baseBlock.style && typeof baseBlock.style === 'object' ? baseBlock.style : {};
  return {
    ...src,
    lock_geometry: true,
    ...extra,
  };
}

/**
 * Bind in-place : même bbox / typo PDF, pas d’absorption du corps.
 * Titres → `title` (le corps reste du texte). Identité / contact → widgets
 * avec un bind étroit (un champ par ligne).
 */
function toInPlaceBlock(baseBlock, classification) {
  if (classification.kind === 'heading') {
    const extra = { semantic_section: classification.type };
    if (classification.sectionLabel) extra.section_label = classification.sectionLabel;
    return {
      ...baseBlock,
      type: 'title',
      content: decodeStructuralText(baseBlock.content) || baseBlock.content,
      style: preservedPdfStyle(baseBlock, extra),
    };
  }
  const preset = createCvSectionBlockPreset(classification.type);
  if (!preset) return null;
  let bind = classification.bindPaths;
  if (!bind && classification.kind === 'identity') bind = ['prenom', 'nom'];
  if (!bind && classification.kind === 'contact') {
    bind = contactBindPaths(baseBlock);
  }
  if (!bind || bind.length === 0) return null;
  return {
    id: baseBlock.id,
    type: preset.type,
    x: baseBlock.x,
    y: baseBlock.y,
    w: baseBlock.w,
    h: baseBlock.h,
    z: baseBlock.z,
    bind,
    style: withPdfColorRuns(baseBlock, preservedPdfStyle(baseBlock)),
  };
}

function toSemanticBlock(baseBlock, classification, regionBlocks) {
  const preset = createCvSectionBlockPreset(classification.type);
  if (!preset) return null;
  const box = unionBox(regionBlocks.length ? regionBlocks : [baseBlock]);
  const style = {
    ...(preset.style || {}),
    ...(baseBlock.style && typeof baseBlock.style === 'object' ? {
      color: baseBlock.style.color,
      font_family: baseBlock.style.font_family,
      align: baseBlock.style.align || preset.style?.align,
    } : {}),
  };
  if (classification.sectionLabel) {
    style.section_label = classification.sectionLabel;
  }
  // Hauteur = bbox freeform uniquement (pas preset.h) pour ne pas chevaucher
  // les sections suivantes en layout freeform sans reflow.
  const out = {
    id: baseBlock.id,
    type: preset.type,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    z: box.z,
    style,
  };
  if (preset.bind !== undefined) {
    out.bind = Array.isArray(preset.bind) ? [...preset.bind] : preset.bind;
  }
  return out;
}

function normImportText(value) {
  return decodeStructuralText(value).toLowerCase();
}

function sortedBindPaths(block) {
  if (!Array.isArray(block?.bind)) return [];
  return [...block.bind].map(String).sort();
}

function identityBindSignature(block) {
  return `identity:${sortedBindPaths(block).join(',')}`;
}

function titleBindSignature(block) {
  const section = block?.style?.semantic_section;
  if (!section) return null;
  const col = Math.round((Number(block.x) || 0) / 16);
  return `title:${section}:${col}`;
}

function boxesOverlap(a, b, padMm = 1.5) {
  const ax1 = Number(a.x) || 0;
  const ay1 = Number(a.y) || 0;
  const ax2 = ax1 + (Number(a.w) || 0);
  const ay2 = ay1 + (Number(a.h) || 0);
  const bx1 = Number(b.x) || 0;
  const by1 = Number(b.y) || 0;
  const bx2 = bx1 + (Number(b.w) || 0);
  const by2 = by1 + (Number(b.h) || 0);
  return ax1 < bx2 + padMm && ax2 + padMm > bx1 && ay1 < by2 + padMm && ay2 + padMm > by1;
}

function isNearBlock(a, b, maxDy = 42, maxDx = 52) {
  return Math.abs((Number(a.y) || 0) - (Number(b.y) || 0)) <= maxDy
    && Math.abs((Number(a.x) || 0) - (Number(b.x) || 0)) <= maxDx;
}

function visualScore(block) {
  const fontSize = Number(block?.style?.font_size) || 0;
  const area = (Number(block?.w) || 0) * (Number(block?.h) || 0);
  return fontSize * 1000 + area;
}

function pickBetterBlock(current, candidate, preferTop) {
  if (!current) return candidate;
  if (preferTop) {
    const dy = (Number(candidate.y) || 0) - (Number(current.y) || 0);
    if (dy < -0.5) return candidate;
    if (dy > 0.5) return current;
  }
  return visualScore(candidate) > visualScore(current) ? candidate : current;
}

function overlapRatio(a, b) {
  const ax1 = Number(a.x) || 0;
  const ay1 = Number(a.y) || 0;
  const ax2 = ax1 + (Number(a.w) || 0);
  const ay2 = ay1 + (Number(a.h) || 0);
  const bx1 = Number(b.x) || 0;
  const by1 = Number(b.y) || 0;
  const bx2 = bx1 + (Number(b.w) || 0);
  const by2 = by1 + (Number(b.h) || 0);
  const iw = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
  const ih = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  const area = Math.min(Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1), Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1));
  return area > 0 ? (iw * ih) / area : 0;
}

function titleFragmentOverlaps(textNorm, titreValue) {
  const compact = (value) => String(value || '').replace(/[^a-z0-9à-ÿ]+/gi, ' ').trim();
  const text = compact(textNorm);
  const titre = compact(titreValue);
  if (text.length < 6 || titre.length < 6) return false;
  return titre.includes(text) || text.includes(titre);
}

function isShortReprintOf(textNorm, values) {
  return values.some((value) => {
    if (!value || value.length < 2) return false;
    if (textNorm === value) return true;
    if (textNorm.length > 40) return false;
    return value.startsWith(`${textNorm} `) || value.endsWith(` ${textNorm}`);
  });
}

/**
 * Après bind in-place : un widget par champ, pas de texte fantôme à côté
 * du nom/contact, pas de titres de section doublés dans la même colonne.
 */
export function pruneInPlaceImportDuplicates(layout, cv = {}) {
  if (!layout?.pages?.length) return layout;

  const prenom = String(cv.prenom || cv.first_name || '').trim();
  const nom = String(cv.nom || cv.last_name || '').trim();
  const fullName = [prenom, nom].filter(Boolean).join(' ');
  const titre = String(cv.titre_professionnel || '').trim();
  const email = String(cv.email || '').trim();
  const phone = String(cv.telephone || cv.phone || '').trim();
  const identityValues = [fullName, prenom, nom].map(normImportText).filter((s) => s.length >= 2);
  const titreValue = normImportText(titre);
  const contactValues = [email, phone].map(normImportText).filter((s) => s.length >= 3);

  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page.blocks) ? [...page.blocks] : [];
    const dropIds = new Set();

    const bestIdentity = new Map();
    for (const block of blocks) {
      if (block?.type !== 'identity') continue;
      const sig = identityBindSignature(block);
      bestIdentity.set(sig, pickBetterBlock(bestIdentity.get(sig), block, false));
    }
    for (const block of blocks) {
      if (block?.type !== 'identity') continue;
      const winner = bestIdentity.get(identityBindSignature(block));
      if (winner && winner.id !== block.id) dropIds.add(block.id);
    }

    const bestContact = { email: null, telephone: null };
    for (const block of blocks) {
      if (block?.type !== 'contact' || dropIds.has(block.id)) continue;
      const paths = sortedBindPaths(block);
      for (const path of paths) {
        if (path !== 'email' && path !== 'telephone') continue;
        bestContact[path] = pickBetterBlock(bestContact[path], block, true);
      }
    }
    for (const block of blocks) {
      if (block?.type !== 'contact' || dropIds.has(block.id)) continue;
      const paths = sortedBindPaths(block).filter((p) => p === 'email' || p === 'telephone');
      const keepsAny = paths.some((path) => bestContact[path]?.id === block.id);
      if (!keepsAny) dropIds.add(block.id);
    }

    const bestTitle = new Map();
    for (const block of blocks) {
      if (block?.type !== 'title' || dropIds.has(block.id)) continue;
      const sig = titleBindSignature(block);
      if (!sig) continue;
      bestTitle.set(sig, pickBetterBlock(bestTitle.get(sig), block, true));
    }
    for (const block of blocks) {
      if (block?.type !== 'title' || dropIds.has(block.id)) continue;
      const sig = titleBindSignature(block);
      if (!sig) continue;
      const winner = bestTitle.get(sig);
      if (winner && winner.id !== block.id) dropIds.add(block.id);
    }

    const identityKept = blocks.filter((b) => b.type === 'identity' && !dropIds.has(b.id));
    const nameIdentities = identityKept.filter((b) => {
      const paths = sortedBindPaths(b);
      return paths.includes('prenom') || paths.includes('nom');
    });
    const titreIdentities = identityKept.filter((b) => (
      sortedBindPaths(b).includes('titre_professionnel')
    ));
    const contactKept = blocks.filter((b) => b.type === 'contact' && !dropIds.has(b.id));
    const titleKept = blocks.filter((b) => b.type === 'title' && !dropIds.has(b.id));

    for (const block of blocks) {
      if (dropIds.has(block.id)) continue;
      if (block.type !== 'text' && block.type !== 'title') continue;
      const textNorm = normImportText(block.content);
      if (!textNorm) {
        dropIds.add(block.id);
        continue;
      }
      if (block.type === 'text' && nameIdentities.some((idb) => isNearBlock(block, idb))
        && isShortReprintOf(textNorm, identityValues)) {
        dropIds.add(block.id);
        continue;
      }
      if (
        block.type === 'text'
        && titreValue.length >= 2
        && (isShortReprintOf(textNorm, [titreValue]) || titleFragmentOverlaps(textNorm, titreValue))
        && titreIdentities.some((idb) => overlapRatio(block, idb) >= 0.18)
      ) {
        dropIds.add(block.id);
        continue;
      }
      if (block.type === 'text' && isShortReprintOf(textNorm, contactValues)) {
        const phoneNorm = normImportText(phone);
        const emailNorm = normImportText(email);
        const matchesPhone = phoneNorm.length >= 3 && isShortReprintOf(textNorm, [phoneNorm]);
        const matchesEmail = emailNorm.length >= 3 && isShortReprintOf(textNorm, [emailNorm]);
        const covered = contactKept.some((cb) => {
          if (!isNearBlock(block, cb, 8, 40)) return false;
          const paths = sortedBindPaths(cb);
          if (matchesPhone && paths.includes('telephone')) return true;
          if (matchesEmail && paths.includes('email')) return true;
          return false;
        });
        if (covered) {
          dropIds.add(block.id);
          continue;
        }
      }
      if (block.type === 'text' && titleKept.some((tb) => {
        const titleNorm = normImportText(tb.content);
        return titleNorm && textNorm === titleNorm && (boxesOverlap(block, tb, 2) || isNearBlock(block, tb, 8, 20));
      })) {
        dropIds.add(block.id);
      }
    }

    const remaining = blocks.filter((b) => (
      (b.type === 'text' || b.type === 'title') && !dropIds.has(b.id)
    ));
    for (let i = 0; i < remaining.length; i += 1) {
      for (let j = i + 1; j < remaining.length; j += 1) {
        const a = remaining[i];
        const b = remaining[j];
        if (dropIds.has(a.id) || dropIds.has(b.id)) continue;
        if (normImportText(a.content) !== normImportText(b.content)) continue;
        if (normImportText(a.content).length < 2) continue;
        const close = boxesOverlap(a, b, 2)
          || (
            Math.abs((Number(a.y) || 0) - (Number(b.y) || 0)) < 3
            && Math.abs((Number(a.x) || 0) - (Number(b.x) || 0)) < 8
          );
        if (!close) continue;
        dropIds.add(visualScore(a) >= visualScore(b) ? b.id : a.id);
      }
    }

    return { ...page, blocks: blocks.filter((b) => !dropIds.has(b.id)) };
  });

  return { ...layout, pages };
}

const MAX_GUTTER_MARKER_MM = 6.5;
const MAX_GUTTER_GAP_MM = 14;
const MAX_BULLET_ALIGN_DY_MM = 8;
const BULLET_GLYPH_RE = /^[•●○◦▪■‣▸∙·\-–—*]$/;
const JOB_TITLE_DASH_RE = /\s[–—-]\s/;

function isGutterMarker(block) {
  const w = Number(block?.w) || 0;
  const h = Number(block?.h) || 0;
  if (Math.max(w, h) > MAX_GUTTER_MARKER_MM) return false;
  if (block.type === 'shape:circle') return true;
  if (block.type === 'image') return true;
  if (block.type === 'text' || block.type === 'title') {
    return BULLET_GLYPH_RE.test(normImportText(block.content));
  }
  return false;
}

function isListBodyLine(block) {
  const text = normImportText(block.content);
  if (text.length < 3) return false;
  const italic = Boolean(block.style?.italic || block.style?.font_style === 'italic');
  if (italic && text.length < 28) return false;
  if (block.style?.bold && JOB_TITLE_DASH_RE.test(text) && text.length < 90) return false;
  return true;
}

function snapMarkerToTextLine(marker, text) {
  const mh = Number(marker.h) || 0;
  const content = String(text.content || '');
  const multiline = content.toLowerCase().includes('<br>') || text.style?.multiline;
  const size = Number(text.style?.font_size) || 10;
  const th = multiline
    ? Math.max(size * (25.4 / 72) * 1.2, 3.2)
    : (Number(text.h) || 0);
  const ty = Number(text.y) || 0;
  return { ...marker, y: Math.round(Math.max(0, ty + (th - mh) / 2) * 100) / 100 };
}

/**
 * Recale les puces sur les lignes de corps (zip par colonne), pas sur le
 * titre / la date au-dessus — sinon toute la liste glisse d'une ligne.
 */
export function alignImportGutterMarkers(layout) {
  if (!layout?.pages?.length) return layout;
  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page.blocks) ? page.blocks : [];
    const targets = blocks.filter((b) => (
      (b.type === 'text' || b.type === 'title')
      && !isGutterMarker(b)
      && normImportText(b.content).length >= 2
    ));
    const markers = blocks.filter((b) => isGutterMarker(b));
    if (!targets.length || !markers.length) return page;

    const columns = new Map();
    for (const marker of markers) {
      const key = Math.round((Number(marker.x) || 0) / 2.5);
      const list = columns.get(key) || [];
      list.push(marker);
      columns.set(key, list);
    }

    const snapped = new Map();
    for (const colMarkers of columns.values()) {
      colMarkers.sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));
      const mx = Number(colMarkers[0].x) || 0;
      const mw = Number(colMarkers[0].w) || 0;
      const markerRight = mx + mw;
      const inColumn = (block) => {
        const tx = Number(block.x) || 0;
        return tx >= markerRight - 1 && tx - markerRight <= MAX_GUTTER_GAP_MM;
      };
      const hosts = blocks
        .filter((b) => (
          (b.type === 'text' || b.type === 'title' || b.type === 'contact' || b.type === 'identity')
          && !isGutterMarker(b)
          && inColumn(b)
        ))
        .sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));
      const colTexts = targets
        .filter((t) => inColumn(t))
        .sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));
      let body = colTexts.filter((t) => isListBodyLine(t));
      if (body.length < Math.max(1, Math.floor(colMarkers.length * 0.6))) {
        body = colTexts.filter((t) => {
          const text = normImportText(t.content);
          const italic = Boolean(t.style?.italic || t.style?.font_style === 'italic');
          return text.length >= 3 && !(italic && text.length < 28);
        });
      }
      const used = new Set();
      for (const marker of colMarkers) {
        const my = (Number(marker.y) || 0) + (Number(marker.h) || 0) / 2;
        const containing = hosts.filter((block) => {
          if (used.has(block.id)) return false;
          const ty = Number(block.y) || 0;
          const th = Number(block.h) || 0;
          return my >= ty - 0.4 && my <= ty + th;
        });
        containing.sort((a, b) => {
          const ay = (Number(a.y) || 0) + (Number(a.h) || 0) / 2;
          const by = (Number(b.y) || 0) + (Number(b.h) || 0) / 2;
          return Math.abs(ay - my) - Math.abs(by - my);
        });
        const host = containing[0];
        if (host) {
          used.add(host.id);
          snapped.set(marker.id, snapMarkerToTextLine(marker, host));
          continue;
        }
        let best = null;
        let bestDy = null;
        for (const text of body) {
          if (used.has(text.id)) continue;
          const ty = Number(text.y) || 0;
          const th = Number(text.h) || 0;
          const inside = my >= ty - 0.4 && my <= ty + th;
          const dy = Math.abs(ty - (Number(marker.y) || 0));
          if (!inside && dy > MAX_BULLET_ALIGN_DY_MM) continue;
          const score = inside ? dy : dy + 20;
          if (best == null || score < bestDy) {
            best = text;
            bestDy = score;
          }
        }
        if (!best) continue;
        used.add(best.id);
        snapped.set(marker.id, snapMarkerToTextLine(marker, best));
      }
    }

    return {
      ...page,
      blocks: blocks.map((b) => snapped.get(b.id) || b),
    };
  });
  return { ...layout, pages };
}

/**
 * Applique le binding sémantique sur un layout structurel freeform.
 * Si ``annotations`` (API AXE-332) est fourni, elles priment sur l'heuristique locale.
 * @param {{ minConfidence?: number, annotations?: Array|null, mode?: 'inPlace'|'absorb' }} [options]
 *   `inPlace` (défaut) : géométrie PDF conservée, titres → title, pas d’absorption.
 *   `absorb` : ancien comportement AXE-329 (région titre→corps → un widget).
 * @returns {{ layout: object, boundCount: number, skippedLowConfidence: number }}
 */
export function bindStructuralTextToSemanticBlocks(layout, cv = {}, {
  minConfidence = MIN_SEMANTIC_CONFIDENCE,
  annotations = null,
  mode = BIND_MODE_IN_PLACE,
} = {}) {
  if (!layout || !Array.isArray(layout.pages)) {
    return { layout, boundCount: 0, skippedLowConfidence: 0 };
  }

  const annotationById = new Map();
  const rawAnnotations = Array.isArray(annotations)
    ? annotations
    : (Array.isArray(layout.semantic_annotations) ? layout.semantic_annotations : []);
  for (const ann of rawAnnotations) {
    if (!ann?.block_id || !ann?.type) continue;
    if (Number(ann.confidence) < minConfidence) continue;
    annotationById.set(String(ann.block_id), ann);
  }

  let boundCount = 0;
  let skippedLowConfidence = 0;

  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
    const textBlocks = blocks
      .filter((b) => b?.type === 'text')
      .slice()
      .sort((a, b) => (Number(a.y) - Number(b.y)) || (Number(a.x) - Number(b.x)));

    const classifications = new Map();
    for (const block of textBlocks) {
      const fromApi = annotationById.get(String(block.id));
      if (fromApi) {
        classifications.set(block.id, {
          type: fromApi.type === 'skills' ? 'skills' : fromApi.type,
          confidence: Number(fromApi.confidence) || 1,
          kind: fromApi.kind || (fromApi.type === 'identity' || fromApi.type === 'contact'
            ? fromApi.type
            : 'heading'),
          sectionLabel: fromApi.section_label || fromApi.sectionLabel,
          bindPaths: Array.isArray(fromApi.bind_paths)
            ? fromApi.bind_paths
            : (Array.isArray(fromApi.bind) ? fromApi.bind : undefined),
        });
        continue;
      }
      const hit = classifyStructuralTextBlock(block, cv);
      if (!hit) continue;
      if (hit.confidence < minConfidence) {
        skippedLowConfidence += 1;
        continue;
      }
      classifications.set(block.id, hit);
    }

    if (mode === BIND_MODE_IN_PLACE) {
      const replaced = new Map();
      for (const block of textBlocks) {
        const cls = classifications.get(block.id);
        if (!cls) continue;
        const next = toInPlaceBlock(block, cls);
        if (!next) continue;
        replaced.set(block.id, next);
        boundCount += 1;
      }
      return {
        ...page,
        blocks: blocks.map((b) => replaced.get(b.id) || b),
      };
    }

    const consumed = new Set();
    const semanticNew = [];

    // absorb : titres → région jusqu'au prochain titre (même colonne).
    for (let i = 0; i < textBlocks.length; i += 1) {
      const head = textBlocks[i];
      if (consumed.has(head.id)) continue;
      const cls = classifications.get(head.id);
      if (!cls || cls.kind !== 'heading') continue;

      const region = [head];
      consumed.add(head.id);
      for (let j = i + 1; j < textBlocks.length; j += 1) {
        const next = textBlocks[j];
        if (consumed.has(next.id)) continue;
        // Autre colonne : ignorer (ne pas stopper la région).
        if (!sameColumn(head, next)) continue;
        const nextCls = classifications.get(next.id);
        // Prochain titre *dans la même colonne* → fin de région.
        if (nextCls?.kind === 'heading') break;
        // Trop loin verticalement → autre zone.
        const gap = (Number(next.y) || 0) - ((Number(region[region.length - 1].y) || 0)
          + (Number(region[region.length - 1].h) || 0));
        if (gap > 28) break;
        region.push(next);
        consumed.add(next.id);
      }

      const semantic = toSemanticBlock(head, cls, region);
      if (semantic) {
        semanticNew.push(semantic);
        boundCount += 1;
      } else {
        region.forEach((b) => consumed.delete(b.id));
      }
    }

    // Identité / contact (blocs isolés, non déjà absorbés).
    for (const block of textBlocks) {
      if (consumed.has(block.id)) continue;
      const cls = classifications.get(block.id);
      if (!cls || (cls.kind !== 'identity' && cls.kind !== 'contact')) continue;
      const semantic = toSemanticBlock(block, cls, [block]);
      if (!semantic) continue;
      consumed.add(block.id);
      semanticNew.push(semantic);
      boundCount += 1;
    }

    // 3) Réimpression PDF seulement si le widget affiche déjà ce champ
    // et recouvre la ligne. Un titre sur la ligne d'en dessous reste visible.
    const identityBoxes = semanticNew.filter((b) => b.type === 'identity');
    if (identityBoxes.length) {
      const titre = decodeStructuralText(cv?.titre_professionnel).toLowerCase();
      const name = decodeStructuralText(
        `${cv?.prenom || cv?.first_name || ''} ${cv?.nom || cv?.last_name || ''}`,
      ).toLowerCase();
      const showsField = (idb, field, line) => (
        Array.isArray(idb.bind) && idb.bind.includes(field) && overlapRatio(line, idb) >= 0.18
      );
      for (const block of textBlocks) {
        if (consumed.has(block.id)) continue;
        const text = decodeStructuralText(block.content).toLowerCase();
        if (!text || text.length < 4) continue;
        const compact = (value) => String(value || '')
          .replace(/[\s|/·•\-–—_.,;:!?«»"'()]+/g, ' ')
          .trim();
        const textC = compact(text);
        // `compact("----") === ""` et `haystack.includes("")` est toujours vrai.
        if (!textC || textC.length < 4) continue;
        const titreC = compact(titre);
        const nameC = compact(name);
        const titreHit = Boolean(
          titreC
          && (
            titreC === textC
            || titreC.includes(textC)
            || (textC.includes(titreC) && textC.length <= titreC.length + 12)
          ),
        );
        const nameHit = Boolean(
          nameC
          && nameC.length >= 5
          && (
            nameC === textC
            || nameC.includes(textC)
            || (textC.includes(nameC) && textC.length <= nameC.length + 12)
          ),
        );
        const coveredByTitle = titreHit && identityBoxes.some((idb) => (
          showsField(idb, 'titre_professionnel', block)
        ));
        const coveredByName = nameHit && identityBoxes.some((idb) => (
          showsField(idb, 'prenom', block) || showsField(idb, 'nom', block)
        ));
        if (coveredByTitle || coveredByName) consumed.add(block.id);
      }
    }

    const kept = blocks.filter((b) => !consumed.has(b.id));
    return {
      ...page,
      blocks: [...kept, ...semanticNew],
    };
  });

  let nextLayout = { ...layout, pages, freeform: true };
  if (mode === BIND_MODE_IN_PLACE) {
    nextLayout = pruneInPlaceImportDuplicates(nextLayout, cv);
  }
  nextLayout = alignImportGutterMarkers(nextLayout);
  // annotations consommées — inutile de les repasser au canvas
  if ('semantic_annotations' in nextLayout) {
    delete nextLayout.semantic_annotations;
  }

  return {
    layout: nextLayout,
    boundCount,
    skippedLowConfidence,
  };
}
