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

/** lazy() avec repli : en cas de 404 sur un chunk (nouveau déploiement), recharge la page une fois. */
export function lazyWithChunkReload(importFn) {
  return lazy(() =>
    importFn().catch((err) => {
      if (isChunkLoadError(err) && typeof window !== 'undefined') {
        const key = 'chunkErrorReload';
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          window.location.reload();
        } else {
          const update = new Error(CHUNK_UPDATE_MESSAGE);
          update.name = 'ChunkLoadError';
          throw update;
        }
      }
      throw err;
    }),
  );
}

/** Réinitialise le flag de reload chunk après chargement réussi. */
export function clearChunkErrorReloadKey() {
  try {
    sessionStorage.removeItem('chunkErrorReload');
  } catch {
    /* ignore */
  }
}
