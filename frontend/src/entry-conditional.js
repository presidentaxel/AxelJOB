/**
 * Entrée build Vite : charge l'app React partout, sauf sur les pages de contenu qui ont leur propre HTML
 * statique (public/*.html : /ats, /faq, /cgu, etc.).
 * Sur / : landing React (menu burger, navigation) ; le HTML statique dans #root est remplacé au montage.
 * Sur /login, /inscription, /mot-de-passe-oublie et /app/* : l'app (authentification, espace connecté).
 * Sur toute autre URL (inconnue) : index.html est servi par le repli SPA ; on charge l'app pour afficher
 * la page 404 (NotFoundPage) à la place de la landing, et on masque le shell statique de la landing le temps du chargement.
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

const STATIC_PAGES = new Set([
  '/ats',
  '/faq',
  '/modeles-cv',
  '/guide-cv',
  '/erreurs-cv',
  '/cv-par-metier',
  '/cv-adapte-chaque-offre',
  '/mentions-legales',
  '/confidentialite',
  '/cgu',
])

const raw = typeof window !== 'undefined' ? window.location.pathname : ''
const p = raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw
const isSpaEntry = p === '/' || p === '/login' || p === '/inscription' || p === '/mot-de-passe-oublie' || p.indexOf('/app') === 0
const loadSpa = typeof window !== 'undefined' && !STATIC_PAGES.has(p)
if (loadSpa && !isSpaEntry) {
  // URL inconnue : ne pas laisser voir (ni faire indexer visuellement) la landing statique avant la 404.
  const shell = document.querySelector('.static-crawlable')
  if (shell) shell.style.display = 'none'
}
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
