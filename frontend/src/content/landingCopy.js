/**
 * Textes de l'accueil partagés par LandingPage.jsx et le HTML statique
 * de index.html. Le test landingCopyMirror vérifie que les deux disent
 * la même chose.
 */

export const STEPS = [
  {
    title: 'Importe ton profil',
    desc: 'LinkedIn, import de CV ou saisie manuelle : ton profil en quelques clics.',
    icon: 'profile',
  },
  {
    title: "Colle l'annonce visée",
    desc: "Copie le texte de l'offre d'emploi dans l'outil.",
    icon: 'paste',
  },
  {
    title: "Laisse l'IA faire la magie",
    desc: 'Adaptation instantanée et suivi de tes candidatures.',
    icon: 'sparkles',
  },
];

export const FEATURES = [
  { title: 'Générateur de CV IA', desc: 'Adaptation aux mots-clés de chaque annonce (ATS-friendly).', icon: 'sparkles' },
  { title: 'Suivi de candidatures', desc: 'Statuts, entretiens, refus - tout centralisé au même endroit.', icon: 'list' },
  { title: 'Export PDF ultra-propre', desc: 'CV et lettre de motivation prêts à envoyer.', icon: 'file' },
];

export const BENEFITS = [
  {
    title: 'Score ATS optimisé',
    desc: "Chaque CV est analysé et adapté pour maximiser son passage dans les filtres automatiques des recruteurs (voir Qu'est-ce que l'ATS ?).",
    linkToAts: true,
    icon: 'target',
  },
  {
    title: 'Gain de temps massif',
    desc: "Plus besoin de réécrire manuellement chaque candidature. L'IA adapte en quelques secondes.",
    icon: 'clock',
  },
  {
    title: 'Suivi centralisé',
    desc: 'Toutes tes candidatures au même endroit : statuts, entretiens, relances et exports.',
    icon: 'list',
  },
];

export const FREE_FEATURES = [
  '3 adaptations de CV',
  'Import PDF  / LinkedIn',
  'Suivi de candidatures',
  'Export PDF',
];

export const PRO_FEATURES = [
  'Adaptations illimitées',
  'Import PDF  / LinkedIn',
  'Suivi de candidatures illimité',
  'Export PDF & dossier complet',
  'Lettre de motivation IA',
  'Support prioritaire',
];

/** Balises meta de index.html (tutoiement, comme le reste de la page). */
export const landingMeta = {
  title: 'AxeL Job - CV adapté à chaque offre en 1 clic | IA & score ATS',
  description:
    "Adapte ton CV à chaque annonce avec l'IA. Améliore ton score ATS, suis tes candidatures et décroche plus d'entretiens. Essai gratuit.",
  ogTitle: 'AxeL Job - CV adapté à chaque offre en 1 clic | IA & ATS',
  ogDescription:
    "Adapte ton CV à chaque annonce avec l'IA. Score ATS, suivi des candidatures, export PDF. Essai gratuit.",
  twitterTitle: 'AxeL Job - CV adapté à chaque offre en 1 clic',
  twitterDescription:
    "Adapte ton CV à chaque annonce avec l'IA. Score ATS, plus d'entretiens. Essai gratuit.",
};

const HERO_TITLE_BEFORE = 'Passe les filtres automatiques. Décroche des ';
const HERO_TITLE_HIGHLIGHT = 'entretiens';
const HERO_TITLE_AFTER = ' en 1 clic.';

export const landingText = {
  brand: 'AxeL Job',
  navHow: 'Comment ça marche',
  navPricing: 'Tarifs',
  navFeatures: 'Fonctionnalités',
  navResources: 'Ressources',
  ctaTry: 'Essayer gratuitement',
  ctaLogin: 'Se connecter',
  ctaStart: 'Commencer',
  heroKicker: 'CV adapté par l'IA',
  heroTitleBefore: HERO_TITLE_BEFORE,
  heroTitleHighlight: HERO_TITLE_HIGHLIGHT,
  heroTitleAfter: HERO_TITLE_AFTER,
  heroTitle: `${HERO_TITLE_BEFORE}${HERO_TITLE_HIGHLIGHT}${HERO_TITLE_AFTER}`,
  heroSubtitle:
    "L'IA analyse l'offre d'emploi et adapte instantanément ton CV pour passer les filtres (ATS) et taper dans l'œil des recruteurs.",
  heroHint: '3 adaptations offertes',
  mockupTitle: 'Adapter un CV',
  mockupUser: 'Adapte mon CV pour ce poste de Chef de projet digital',
  mockupAi: 'CV adapté (score ATS 92/100). Titre, résumé et expériences optimisés.',
  mockupScoreLabel: 'Score ATS',
  mockupScoreValue: '92/100',
  howKicker: 'En 3 étapes',
  howTitle: 'Comment ça marche',
  pricingKicker: 'Simple et sans surprise',
  pricingTitle: 'Tarifs',
  pricingSubtitle: 'Commence gratuitement. Passe Pro quand tu en as besoin.',
  planFree: 'Gratuit',
  priceFree: '0€',
  periodFree: 'pour toujours',
  ctaFree: 'Commencer gratuitement',
  badgePopular: 'Populaire',
  planPro: 'Pro',
  pricePro: '10€',
  periodPro: '/ mois',
  ctaPro: 'Passer Pro',
  featuresKicker: 'Tout au même endroit',
  featuresTitle: 'Fonctionnalités',
  whyKicker: 'Ce que tu y gagnes',
  whyTitle: 'Pourquoi AxeL Job ?',
  atsLink: "Qu'est-ce que l'ATS ?",
  finalTitle: 'Prêt à décrocher le job de tes rêves ?',
  finalSubtitle: 'Crée ton compte gratuit et teste 3 adaptations de CV.',
  footerColLegal: 'Légal',
  footerColContact: 'Contact',
  footerBefore:
    'AxeL Job - Ton CV sur-mesure pour chaque annonce. Une réalisation',
  footerBrand: 'Axel Project',
  footerSupport: 'Support',
  footerAts: 'CV et ATS',
  footerFaq: 'FAQ',
  footerModeles: 'Modèles de CV',
  footerGuide: 'Guide CV',
  footerErreurs: 'Erreurs à éviter',
  footerMetier: 'CV par métier',
  footerAdapte: 'CV adapté à chaque offre',
  legalMentions: 'Mentions légales',
  legalPrivacy: 'Confidentialité',
  legalTerms: 'CGU',
};

export const ARTICLE_NAV_LINKS = [
  { to: '/ats', label: landingText.atsLink },
  { to: '/faq', label: landingText.footerFaq },
  { to: '/modeles-cv', label: landingText.footerModeles },
  { to: '/guide-cv', label: landingText.footerGuide },
  { to: '/erreurs-cv', label: landingText.footerErreurs },
  { to: '/cv-par-metier', label: landingText.footerMetier },
  { to: '/cv-adapte-chaque-offre', label: landingText.footerAdapte },
];

export function landingCopyright(year) {
  return `© ${year} ${landingText.footerBefore}`;
}

/** Phrases qui doivent être identiques dans index.html et React. */
export function sharedLandingStrings() {
  const fromLists = [STEPS, FEATURES, BENEFITS].flatMap((rows) =>
    rows.flatMap((row) => [row.title, row.desc]),
  );
  return [
    ...Object.values(landingText),
    ...fromLists,
    ...FREE_FEATURES,
    ...PRO_FEATURES,
    ...ARTICLE_NAV_LINKS.map((link) => link.label),
    'Étape 1',
    'Étape 2',
    'Étape 3',
  ];
}
