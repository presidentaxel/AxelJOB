/**
 * Routes d'auth AxeL Job (AXE-494).
 * Connexion, inscription et mot de passe oublié sont des URLs distinctes.
 */
export const AUTH_PATHS = {
  signin: '/login',
  signup: '/inscription',
  reset: '/mot-de-passe-oublie',
};

export function authModeFromPath(pathname) {
  if (pathname === AUTH_PATHS.signup) return 'signup';
  if (pathname === AUTH_PATHS.reset) return 'reset';
  if (pathname === AUTH_PATHS.signin) return 'signin';
  return null;
}

export function isAuthPath(pathname) {
  return authModeFromPath(pathname) !== null;
}
