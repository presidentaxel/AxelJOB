/**
 * Extraction de texte HTML pour les tests, sans regex de « nettoyage » : on parcourt la chaîne
 * (indexOf insensible à la casse, balayage des chevrons), ce qui évite les cas d'injection
 * qu'une suite de .replace(/<script.../) laisse passer.
 */

/** Supprime chaque bloc `<open ...> ... </close>` (insensible à la casse), balises imbriquées comprises. */
export function removeBlocks(src, open, close) {
  const lower = src.toLowerCase();
  let out = '';
  let from = 0;
  for (;;) {
    const start = lower.indexOf(open, from);
    if (start === -1) return out + src.slice(from);
    const end = lower.indexOf(close, start + open.length);
    if (end === -1) return out + src.slice(from, start);
    out += src.slice(from, start);
    from = end + close.length;
  }
}

/** Retire toutes les balises : tout ce qui va de `<` au `>` suivant est supprimé, en boucle. */
export function stripTags(src) {
  let out = '';
  let depth = 0;
  for (const ch of src) {
    if (ch === '<') depth += 1;
    else if (ch === '>' && depth > 0) depth -= 1;
    else if (depth === 0) out += ch;
  }
  return out;
}

/** Décode &nbsp; et &amp; en un seul passage (jamais de double décodage de `&amp;nbsp;`). */
export function decodeEntities(src, nbsp = ' ') {
  return src.replace(/&(nbsp|amp);/g, (_, name) => (name === 'nbsp' ? nbsp : '&'));
}

/** Texte visible d'une page : sans head, script, style, commentaires ni balises. */
export function visibleText(src, { keepH1 = false } = {}) {
  let body = removeBlocks(src, '<head>', '</head>');
  body = removeBlocks(body, '<script', '</script>');
  body = removeBlocks(body, '<style', '</style>');
  body = removeBlocks(body, '<!--', '-->');
  if (!keepH1) body = removeBlocks(body, '<h1>', '</h1>');
  return decodeEntities(stripTags(body));
}
