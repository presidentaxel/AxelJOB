/**
 * Meta robots pour routes SPA (même index.html que la home : le crawler exécute le JS).
 * Aligné sur public/*.html : login (noindex dans login.html en prod) + pages légales en noindex.
 */
const DEFAULT_ROBOTS =
  'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

const NOINDEX_PATHS = new Set(['/login', '/inscription', '/mot-de-passe-oublie', '/mentions-legales', '/confidentialite', '/cgu']);

/** Vrai tant que la page 404 est affichée : syncRobotsMeta (appelé par App après le rendu enfant) ne doit pas la repasser en index. */
let notFoundShown = false;
const NOINDEX = 'noindex, follow';

function robotsMeta() {
  let el = document.querySelector('meta[name="robots"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'robots');
    document.head.appendChild(el);
  }
  return el;
}

/** Marque la 404 en noindex ; renvoie la fonction de nettoyage à retourner depuis un useEffect. */
export function setNotFoundRobots() {
  if (typeof document === 'undefined') return undefined;
  notFoundShown = true;
  robotsMeta().setAttribute('content', NOINDEX);
  return () => {
    notFoundShown = false;
  };
}

export function syncRobotsMeta(pathname) {
  if (typeof document === 'undefined') return;
  robotsMeta().setAttribute('content', notFoundShown || NOINDEX_PATHS.has(pathname) ? NOINDEX : DEFAULT_ROBOTS);
}
