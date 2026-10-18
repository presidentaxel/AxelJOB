/**
 * Entrée build Vite : charge l'app React sur /, /login et /app/*.
 * Sur / : landing React (menu burger, navigation) ; le HTML statique dans #root est remplacé au montage.
 * Sur /ats, /faq, etc. : pages statiques (public/*.html) ou index sans bundle si autre stratégie de déploiement.
 */
import { CHUNK_UPDATE_MESSAGE } from './lib/userFacingError.js'

const CHUNK_RELOAD_KEY = 'chunkErrorReloadAt'
const CHUNK_RELOAD_WINDOW_MS = 60_000

function reloadOnceForChunkError() {
  try {
    const at = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
    if (Number.isFinite(at) && at > 0 && Date.now() - at < CHUNK_RELOAD_WINDOW_MS) return false
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

function isChunkLoadError(err) {
  const msg = err?.message || ''
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Loading chunk') ||
    (err?.name === 'TypeError' && msg.includes('fetch'))
  )
}

const p = typeof window !== 'undefined' ? window.location.pathname : ''
const loadSpa = p === '/' || p === '/login' || p.indexOf('/app') === 0
if (loadSpa) {
  import('./main.jsx').catch((err) => {
    if (typeof window !== 'undefined' && isChunkLoadError(err)) {
      if (reloadOnceForChunkError()) return
      const root = document.getElementById('root')
      if (root) root.textContent = CHUNK_UPDATE_MESSAGE
    }
    throw err
  })
}
