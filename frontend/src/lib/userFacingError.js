/**
 * Catalogue unique des messages visibles (AXE-489).
 * Le détail technique reste dans les logs ; l'UI ne montre que ces phrases.
 */

export const SUPABASE_DEV_CONFIG_MESSAGE =
  'Configure Supabase pour utiliser l\'application. Ajoute VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env (voir .env.example).';

export const SUPABASE_PROD_UNAVAILABLE =
  'AxeL Job est momentanément indisponible. Réessaie dans quelques minutes.';

export const TIMEOUT_MESSAGE = 'Le serveur ne répond pas. Réessaie dans un instant.';

export const NETWORK_MESSAGE = 'Connexion impossible. Vérifie ton réseau puis réessaie.';

export const CHUNK_UPDATE_MESSAGE = 'Une mise à jour est disponible. Recharge la page.';

const CATALOG = {
  400: 'Cette demande n\'est pas valide. Vérifie les informations et réessaie.',
  401: 'Ta session a expiré. Reconnecte-toi.',
  402: 'Tu as atteint la limite de ton offre.',
  403: 'Tu n\'as pas accès à cette page.',
  404: 'On ne trouve pas cet élément.',
  413: 'Le fichier est trop lourd.',
  422: 'Certaines informations sont incomplètes ou incorrectes.',
  429: 'Trop de tentatives. Réessaie dans un instant.',
  500: 'Un problème est survenu. Réessaie ou contacte le support.',
  502: 'Le service n\'a pas répondu. Réessaie.',
  503: 'Ce service n\'est pas disponible pour le moment.',
  504: TIMEOUT_MESSAGE,
};

const TECHNICAL = /GEMINI_API_KEY|SUPPORT_EMAIL|RESEND_|webhook|API_KEY|Paiement non configuré|Vérifie Resend|Traceback|Exception|psycopg|sqlalchemy|does not exist|syntax error/i;

const BUSINESS_STATUS = new Set([400, 404, 422]);

export function supabaseConfigMessage(dev) {
  return dev ? SUPABASE_DEV_CONFIG_MESSAGE : SUPABASE_PROD_UNAVAILABLE;
}

function looksTechnical(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.startsWith('<') || /<html/i.test(trimmed)) return true;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true;
  return TECHNICAL.test(trimmed);
}

export function userFacingHttpMessage(status, raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const code = Number(status);
  if (code === 401 || code === 402 || code === 413 || code === 429 || code >= 500) {
    return CATALOG[code] || CATALOG[500];
  }
  if (code === 403) {
    if (text && !looksTechnical(text) && /accès|access/i.test(text) && text.length < 180) return text;
    return CATALOG[403];
  }
  if (BUSINESS_STATUS.has(code) && text && !looksTechnical(text) && text.length < 240) {
    return text;
  }
  if (CATALOG[code]) return CATALOG[code];
  if (text && !looksTechnical(text) && text.length < 240) return text;
  return CATALOG[500];
}

export function userFacingAuthError(err) {
  const raw = typeof err?.message === 'string' ? err.message.trim() : '';
  const msg = raw.toLowerCase();
  if (err?.status === 429 || msg.includes('rate limit') || msg.includes('rate_limit')) {
    return CATALOG[429];
  }
  if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('invalid email or password')) {
    return 'E-mail ou mot de passe incorrect.';
  }
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return 'Un compte existe déjà avec cet e-mail.';
  }
  if (msg.includes('expired') || msg.includes('otp_expired') || msg.includes('invalid token')) {
    return 'Ce lien n\'est plus valable. Demande-en un nouveau.';
  }
  if (
    raw
    && !looksTechnical(raw)
    && !/\b(invalid|failed|unable|error|expired|user already|email link)\b/i.test(raw)
  ) {
    return raw;
  }
  return 'Connexion impossible. Réessaie.';
}
