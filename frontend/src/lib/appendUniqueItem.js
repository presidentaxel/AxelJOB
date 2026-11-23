/**
 * Ajoute `value` (nettoyé) à la liste, sauf s'il est vide ou déjà présent (casse ignorée).
 * Renvoie la même liste si rien n'est ajouté.
 */
export function appendUniqueItem(list, value) {
  const items = Array.isArray(list) ? list : [];
  const v = String(value ?? '').trim();
  if (!v) return items;
  const key = v.toLocaleLowerCase('fr');
  const exists = items.some((x) => typeof x === 'string' && x.trim().toLocaleLowerCase('fr') === key);
  return exists ? items : [...items, v];
}
