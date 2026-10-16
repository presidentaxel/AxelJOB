/** Une police PDF n'est utilisée que si elle dessine tout le texte affiché. */

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

/**
 * Retire ``font_family`` quand le sous-ensemble ne contient pas toutes les lettres.
 * Sinon le navigateur mélange la police embarquée et une police de repli, lettre par lettre.
 */
export function fontStyleForText(style, text, fonts) {
  if (!style || typeof style !== 'object' || !style.font_family) return style || {};
  const sample = String(text || '');
  if (!sample.trim()) return style;
  const names = familyNames(style.font_family);
  const weight = requestedWeight(style);
  const italic = Boolean(style.italic || style.font_style === 'italic');
  const face = (Array.isArray(fonts) ? fonts : []).find((item) => (
    item
    && names.includes(item.family)
    && Number(item.weight) === weight
    && (item.style === 'italic') === italic
    && typeof item.coverage === 'string'
    && item.coverage.length > 0
  ));
  if (!face) return style;
  const missing = [...sample].some((ch) => ch.trim() && !face.coverage.includes(ch));
  if (!missing) return style;
  const next = { ...style };
  delete next.font_family;
  return next;
}
