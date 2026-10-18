import { lazy } from 'react';
import { CHUNK_UPDATE_MESSAGE } from './userFacingError.js';

/** Erreur de chargement d'un chunk (ex. 404 après un nouveau déploiement). */
export function isChunkLoadError(err) {
  const msg = err?.message || '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('Une mise à jour est disponible') ||
    err?.name === 'ChunkLoadError' ||
    (err?.name === 'TypeError' && msg.includes('fetch'))
  );
}

const CHUNK_RELOAD_KEY = 'chunkErrorReload';

/** lazy() avec repli : en cas de 404 sur un chunk (nouveau déploiement), recharge la page une fois. */
export function lazyWithChunkReload(importFn) {
  return lazy(() =>
    importFn()
      .then((mod) => {
        clearChunkErrorReloadKey();
        return mod;
      })
      .catch((err) => {
        if (isChunkLoadError(err) && typeof window !== 'undefined') {
          try {
            if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
              sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
              window.location.reload();
              return new Promise(() => {});
            }
          } catch {
            /* sessionStorage indisponible : on affiche l'erreur, sans recharger */
          }
          const update = new Error(CHUNK_UPDATE_MESSAGE);
          update.name = 'ChunkLoadError';
          throw update;
        }
        throw err;
      }),
  );
}

/** Efface le drapeau seulement après un chunk réellement chargé, jamais au démarrage. */
export function clearChunkErrorReloadKey() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    /* ignore */
  }
}
