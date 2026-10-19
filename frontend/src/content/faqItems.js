/**
 * Questions / réponses de la FAQ : source unique de la page /faq (FaqPage.jsx, public/faq.html)
 * et de la section FAQ de la landing (LandingPage.jsx, index.html).
 *
 * Une réponse = liste de paragraphes ; un paragraphe = liste de morceaux :
 *   - une chaîne : texte brut ;
 *   - { href, text } : lien vers une source externe ;
 *   - { strong } : texte en gras.
 * Les espaces insécables (U+00A0) précèdent « ? ! : ; » et « % » comme partout ailleurs sur le site.
 */
import { ARTICLE_SOURCE_URLS as U } from './articleSources.js';

const src = (href, text) => ({ href, text });

export const FAQ_ITEMS = [
  {
    q: "Pourquoi mon CV ne passe pas si j'ai les bonnes compétences\u00a0?",
    slug: 'cv-bonnes-competences',
    a: [
      [
        "Selon l'étude Harvard Business School «\u00a0",
        src(U.HBS_HIDDEN_WORKERS, 'Hidden Workers'),
        "\u00a0», 88\u00a0% des employeurs estiment perdre des candidats qualifiés non pas parce que l'ATS les rejette automatiquement, mais parce que les mots utilisés dans leur CV ne correspondent pas aux termes exacts configurés par le recruteur. Le CV est bien lu, mais le vocabulaire ne matche pas.",
      ],
    ],
  },
  {
    q: 'Est-ce que le format PDF est problématique\u00a0?',
    slug: 'format-pdf-problematique',
    a: [
      [
        "Oui, dans certains cas. L'analyse ",
        src(U.EDLIGO_1000_CV, 'EDLIGO'),
        " de 1\u00a0000 CV rejetés sur Workday, Taleo et Greenhouse montre qu'un PDF a un taux d'échec de parsing de 18\u00a0% contre 4\u00a0% pour un fichier DOCX simple. Si l'offre ne précise pas de format, le DOCX est plus sûr.",
      ],
    ],
  },
  {
    q: 'Est-ce que je dois adapter mon CV à chaque offre\u00a0?',
    slug: 'adapter-cv-chaque-offre',
    a: [
      [
        'Les données sont claires. Selon une analyse ',
        src(U.JOBSCAN_TAILOR, 'Jobscan'),
        " portant sur près d'un million de candidatures, intégrer le titre de poste exact de l'offre dans son CV rend 3,5 fois plus probable d'obtenir un entretien. Et selon des données issues de 3,2 millions d'utilisateurs ",
        src(U.TEAL_TAILOR, 'Teal'),
        ", adapter son CV à l'offre rend 6 fois plus probable d'être convoqué en entretien.",
      ],
    ],
  },
  {
    q: "Puis-je utiliser l'IA pour rédiger mon CV\u00a0?",
    slug: 'ia-rediger-cv',
    a: [
      [
        "Oui, et les recruteurs l'acceptent. Selon une étude ",
        src(U.CANVA_SAGO_2025, 'Canva/Sago'),
        " menée sur 10\u00a0000 personnes dans 10 pays, 90\u00a0% des recruteurs considèrent qu'il est acceptable d'utiliser l'IA générative dans la rédaction de candidatures. Une étude ",
        src(U.MIT_SLOAN_AI_RESUME, 'MIT Sloan'),
        " confirme que les candidats ayant bénéficié d'une assistance algorithmique pour rédiger leur CV sont 8\u00a0% plus susceptibles d'être embauchés et reçoivent 7,8\u00a0% d'offres supplémentaires.",
      ],
      [
        { strong: "Note de contexte sur l'étude MIT\u00a0:" },
        " elle porte sur une plateforme de travail en ligne, avec une majorité de candidats non-anglophones. L'assistance portait sur l'orthographe et la grammaire, pas sur la personnalisation à une offre - les résultats sont pertinents, mais à lire dans ce contexte. ",
        src(U.MIT_SLOAN_AI_RESUME, 'MIT Sloan'),
      ],
    ],
  },
  {
    q: 'Mon CV doit faire combien de pages\u00a0?',
    slug: 'nombre-pages-cv',
    a: [
      [
        'Selon le Resume Genius Hiring Trends Survey 2025 (',
        src(U.RESUME_GENIUS_STATS, 'Resume Genius'),
        "), 54\u00a0% des recruteurs préfèrent un CV de deux pages, et 70\u00a0% sont plus enclins à considérer un CV de deux pages plutôt qu'un de une page pour les profils avec de l'expérience. En France, une page reste souvent la norme pour les profils juniors.",
      ],
    ],
  },
  {
    q: "Est-ce que les fautes d'orthographe sont vraiment éliminatoires\u00a0?",
    slug: 'fautes-orthographe',
    a: [
      [
        'Oui. Selon ',
        src(U.RESUME_GENIUS_STATS, 'Resume Genius'),
        ", 77\u00a0% des recruteurs rejettent immédiatement un CV contenant des fautes ou une mauvaise grammaire. L'étude ",
        src(U.MIT_SLOAN_AI_RESUME, 'MIT Sloan'),
        " est encore plus précise\u00a0: les candidats avec plus de 99\u00a0% de mots correctement orthographiés sont embauchés 3 fois plus souvent que ceux dont le taux d'orthographe est inférieur à 90\u00a0% - qui n'ont que 3\u00a0% de chances d'être recrutés dans leur premier mois.",
      ],
    ],
  },
];

/** Questions reprises sur la landing (les 5 réponses courtes ; la plus longue reste sur /faq). */
export const LANDING_FAQ_SLUGS = [
  'cv-bonnes-competences',
  'format-pdf-problematique',
  'adapter-cv-chaque-offre',
  'nombre-pages-cv',
  'fautes-orthographe',
];

export const LANDING_FAQ_ITEMS = LANDING_FAQ_SLUGS.map((slug) => FAQ_ITEMS.find((item) => item.slug === slug));

/** Tous les textes affichés par ces questions (utilisé par le test de miroir index.html / React). */
export function faqStrings(items) {
  return items.flatMap((item) => [
    item.q,
    ...item.a.flatMap((paragraph) =>
      paragraph.map((part) => (typeof part === 'string' ? part : part.text ?? part.strong)),
    ),
  ]);
}
