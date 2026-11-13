/**
 * Identifiant d'ancre d'un titre de page de contenu (sommaire AXE-470).
 * Utilisé par ArticlesPages et par le test qui vérifie les HTML statiques de public/.
 * Exemple : « Tech & développement » -> « tech-developpement ».
 */
export function contentSlug(heading) {
  return String(heading)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
