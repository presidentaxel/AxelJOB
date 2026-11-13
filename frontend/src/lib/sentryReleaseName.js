/**
 * Un seul nom de release pour le SDK et l'upload des source maps.
 * Priorité : VITE_SENTRY_RELEASE, puis SENTRY_RELEASE, puis SHA git.
 * Vide = pas de release (évite d'uploader des maps sur un nom que le navigateur n'envoie pas).
 */
export function resolveSentryReleaseName({
  viteRelease = '',
  sentryRelease = '',
  gitSha = '',
} = {}) {
  const explicit = String(viteRelease || '').trim() || String(sentryRelease || '').trim();
  if (explicit) return explicit;
  const sha = String(gitSha || '').trim();
  return sha || undefined;
}
