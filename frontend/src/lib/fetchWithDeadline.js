import { TIMEOUT_MESSAGE } from './userFacingError.js';

/** Un reload local laisse sinon les fetch en pending et l'écran « Chargement… » ne part plus. */
export const API_REQUEST_TIMEOUT_MS = 12000;

/**
 * Import CV : plusieurs appels au modèle après la lecture du fichier.
 * Le délai court des lectures couperait la requête avant la réponse.
 */
export const CV_IMPORT_REQUEST_TIMEOUT_MS = 180000;

export async function fetchWithDeadline(url, options = {}, timeoutMs = API_REQUEST_TIMEOUT_MS) {
  const upstream = options.signal;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onUpstreamAbort = () => controller.abort();
  if (upstream) {
    if (upstream.aborted) controller.abort();
    else upstream.addEventListener('abort', onUpstreamAbort, { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError' && !(upstream && upstream.aborted)) {
      const timeout = new Error(TIMEOUT_MESSAGE);
      timeout.name = 'TimeoutError';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (upstream) upstream.removeEventListener('abort', onUpstreamAbort);
  }
}
