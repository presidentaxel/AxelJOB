/**
 * Entrée sur les pages publiques avec une session déjà ouverte (AXE-504).
 *
 * Règle : une session Supabase existante ne sert PAS à quitter une page publique
 * (`/`, `/login` en chargement direct, FAQ, guides...). On n'entre dans l'app que si :
 *  - l'utilisateur a cliqué sur un bouton de connexion (CTA, header) ;
 *  - ou l'utilisateur arrive d'un lien interne vers /login (pages statiques) ;
 *  - ou l'URL est un retour d'authentification (OAuth Google/LinkedIn, lien e-mail de
 *    réinitialisation de mot de passe), qui doit aboutir dans l'app.
 *
 * Mécanisme « clic de connexion » : state de router (`{ loginIntent: true }`) posé par
 * `loginNavOptions()` sur la navigation vers /login. Choisi plutôt qu'un paramètre d'URL
 * (qui resterait dans l'historique et se rejouerait au partage) ou qu'un flag
 * sessionStorage (qui survivrait dans l'onglet). Le state est attaché à l'entrée d'historique,
 * disparaît avec `replace` quand on entre dans l'app, et « Recharger l'accueil »
 * (`location.assign('/')`) repart d'une entrée neuve, donc sans intention.
 *
 * Un rafraîchissement de /app/* n'est pas concerné : ce n'est pas une page publique.
 */
import { isAuthPath } from './authPaths.js';

export const LOGIN_INTENT_KEY = 'loginIntent';

/** Options de navigation à passer à navigate('/login', …) pour un vrai clic de connexion. */
export function loginNavOptions(extra = {}) {
  return { ...extra, state: { [LOGIN_INTENT_KEY]: true } };
}

/** L'URL est-elle un retour d'authentification (OAuth PKCE/implicite, lien e-mail) ? */
export function isAuthCallbackUrl(search = '', hash = '') {
  const h = String(hash || '').replace(/^#/, '');
  const hp = new URLSearchParams(h);
  if (hp.has('access_token') || hp.has('refresh_token') || hp.get('type') === 'recovery') return true;
  return new URLSearchParams(String(search || '')).has('code');
}

/**
 * Arrivée sur /login, /inscription... par un lien interne (page statique : FAQ, guide, 404...).
 * Ces pages sont servies en HTML statique : leurs liens « Se connecter » sont des chargements
 * complets, sans state de router. Un referrer de même origine sur une page d'authentification
 * vaut donc clic de connexion. « Recharger l'accueil » arrive sur `/`, pas ici.
 */
export function isInternalLoginLink({ pathname, referrer, origin }) {
  if (!isAuthPath(pathname) || !referrer || !origin) return false;
  try {
    return new URL(referrer).origin === origin;
  } catch {
    return false;
  }
}

export function isPublicEntryPath(pathname) {
  return pathname === '/' || isAuthPath(pathname);
}

/**
 * @returns {'enter' | 'stay' | 'none'}
 *  - 'enter' : session présente, page d'entrée publique, et clic/retour d'auth -> aller dans l'app
 *  - 'stay'  : session présente sur une page d'entrée publique, simple visite -> rester
 *  - 'none'  : rien à décider (pas de session ou hors pages d'entrée)
 */
export function decidePublicEntry({ hasSession, pathname, locationState, authCallback }) {
  if (!hasSession || !isPublicEntryPath(pathname)) return 'none';
  if (authCallback || locationState?.[LOGIN_INTENT_KEY] === true) return 'enter';
  return 'stay';
}

/* Snapshot pris à l'import : supabase-js nettoie le hash/?code= après avoir créé la session,
   avant que l'effet de redirection de App ne s'exécute. */
let authCallbackPending =
  typeof window !== 'undefined' &&
  (isAuthCallbackUrl(window.location.search, window.location.hash) ||
    isInternalLoginLink({
      pathname: window.location.pathname,
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      origin: window.location.origin,
    }));

export function hasPendingAuthCallback() {
  return authCallbackPending;
}

/** À appeler une fois l'entrée dans l'app faite, pour ne pas la rejouer sur une visite ultérieure. */
export function consumeAuthCallback() {
  authCallbackPending = false;
}
