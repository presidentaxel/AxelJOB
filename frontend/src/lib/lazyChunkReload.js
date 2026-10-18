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

const CHUNK_RELOAD_KEY = 'chunkErrorReloadAt';
const CHUNK_RELOAD_WINDOW_MS = 60_000;

/** True si un rechargement automatique a déjà eu lieu dans la dernière minute. */
export function chunkReloadBlocked() {
  try {
    const at = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    return Number.isFinite(at) && at > 0 && Date.now() - at < CHUNK_RELOAD_WINDOW_MS;
  } catch {
    return true;
  }
}

/** Recharge une seule fois. Un chunk qui réussit ne doit pas effacer ce délai. */
export function reloadOnceForChunkError() {
  if (typeof window === 'undefined' || chunkReloadBlocked()) return false;
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** lazy() avec repli : en cas de 404 sur un chunk (nouveau déploiement), recharge la page une fois. */
export function lazyWithChunkReload(importFn) {
  return lazy(() =>
    importFn().catch((err) => {
      if (isChunkLoadError(err) && typeof window !== 'undefined') {
        if (reloadOnceForChunkError()) return new Promise(() => {});
        const update = new Error(CHUNK_UPDATE_MESSAGE);
        update.name = 'ChunkLoadError';
        throw update;
      }
      throw err;
    }),
  );
}

/** Efface le délai de rechargement. Réservé à un chargement réellement stable, jamais au démarrage. */
export function clearChunkErrorReloadKey() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    /* ignore */
  }
}
