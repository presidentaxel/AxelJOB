import { useEffect } from 'react';
import { ARTICLE_SOURCE_URLS as U } from '../content/articleSources.js';
import { analyticsAttrs } from '../lib/analyticsAttrs.js';
import ContentScrollToTop from './ContentScrollToTop';
import { ContentHeader, ContentCta, ContentFooter } from './ContentChrome.jsx';

function Out({ href, children }) {
  return (
    <a href={href} className="content-source" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

const FAQ_ITEMS = [
  {
    q: "Pourquoi mon CV ne passe pas si j'ai les bonnes compétences ?",
    slug: 'cv-bonnes-competences',
    a: (
      <p>
        Selon l&apos;étude Harvard Business School «&nbsp;
        <Out href={U.HBS_HIDDEN_WORKERS}>Hidden Workers</Out>
        &nbsp;», 88&nbsp;% des employeurs estiment perdre des candidats qualifiés non pas parce que l&apos;ATS les rejette automatiquement, mais parce que les mots utilisés dans leur CV ne correspondent pas aux termes exacts configurés par le recruteur. Le CV est bien lu, mais le vocabulaire ne matche pas.
      </p>
    ),
  },
  {
    q: 'Est-ce que le format PDF est problématique ?',
    slug: 'format-pdf-problematique',
    a: (
      <p>
        Oui, dans certains cas. L&apos;analyse{' '}
        <Out href={U.EDLIGO_1000_CV}>EDLIGO</Out>
        {' '}de 1&nbsp;000 CV rejetés sur Workday, Taleo et Greenhouse montre qu&apos;un PDF a un taux d&apos;échec de parsing de 18&nbsp;% contre 4&nbsp;% pour un fichier DOCX simple. Si l&apos;offre ne précise pas de format, le DOCX est plus sûr.
      </p>
    ),
  },
  {
    q: 'Est-ce que je dois adapter mon CV à chaque offre ?',
    slug: 'adapter-cv-chaque-offre',
    a: (
      <p>
        Les données sont claires. Selon une analyse{' '}
        <Out href={U.JOBSCAN_TAILOR}>Jobscan</Out>
        {' '}portant sur près d&apos;un million de candidatures, intégrer le titre de poste exact de l&apos;offre dans son CV rend 3,5 fois plus probable d&apos;obtenir un entretien. Et selon des données issues de 3,2 millions d&apos;utilisateurs{' '}
        <Out href={U.TEAL_TAILOR}>Teal</Out>
        , adapter son CV à l&apos;offre rend 6 fois plus probable d&apos;être convoqué en entretien.
      </p>
    ),
  },
  {
    q: "Puis-je utiliser l'IA pour rédiger mon CV ?",
    slug: 'ia-rediger-cv',
    a: (
      <>
        <p>
          Oui, et les recruteurs l&apos;acceptent. Selon une étude{' '}
          <Out href={U.CANVA_SAGO_2025}>Canva/Sago</Out>
          {' '}menée sur 10&nbsp;000 personnes dans 10 pays, 90&nbsp;% des recruteurs considèrent qu&apos;il est acceptable d&apos;utiliser l&apos;IA générative dans la rédaction de candidatures. Une étude{' '}
          <Out href={U.MIT_SLOAN_AI_RESUME}>MIT Sloan</Out>
          {' '}confirme que les candidats ayant bénéficié d&apos;une assistance algorithmique pour rédiger leur CV sont 8&nbsp;% plus susceptibles d&apos;être embauchés et reçoivent 7,8&nbsp;% d&apos;offres supplémentaires.
        </p>
        <p>
          <strong>Note de contexte sur l&apos;étude MIT&nbsp;:</strong> elle porte sur une plateforme de travail en ligne, avec une majorité de candidats non-anglophones. L&apos;assistance portait sur l&apos;orthographe et la grammaire, pas sur la personnalisation à une offre - les résultats sont pertinents, mais à lire dans ce contexte.{' '}
          <Out href={U.MIT_SLOAN_AI_RESUME}>MIT Sloan</Out>
        </p>
      </>
    ),
  },
  {
    q: 'Mon CV doit faire combien de pages ?',
    slug: 'nombre-pages-cv',
    a: (
      <p>
        Selon le Resume Genius Hiring Trends Survey 2025 (
        <Out href={U.RESUME_GENIUS_STATS}>Resume Genius</Out>
        ), 54&nbsp;% des recruteurs préfèrent un CV de deux pages, et 70&nbsp;% sont plus enclins à considérer un CV de deux pages plutôt qu&apos;un de une page pour les profils avec de l&apos;expérience. En France, une page reste souvent la norme pour les profils juniors.
      </p>
    ),
  },
  {
    q: "Est-ce que les fautes d'orthographe sont vraiment éliminatoires ?",
    slug: 'fautes-orthographe',
    a: (
      <p>
        Oui. Selon{' '}
        <Out href={U.RESUME_GENIUS_STATS}>Resume Genius</Out>
        , 77&nbsp;% des recruteurs rejettent immédiatement un CV contenant des fautes ou une mauvaise grammaire. L&apos;étude{' '}
        <Out href={U.MIT_SLOAN_AI_RESUME}>MIT Sloan</Out>
        {' '}est encore plus précise&nbsp;: les candidats avec plus de 99&nbsp;% de mots correctement orthographiés sont embauchés 3 fois plus souvent que ceux dont le taux d&apos;orthographe est inférieur à 90&nbsp;% - qui n&apos;ont que 3&nbsp;% de chances d&apos;être recrutés dans leur premier mois.
      </p>
    ),
  },
];

/** Ouvre la question ciblée par #ancre (les réponses sont repliées par défaut). */
function useOpenFaqFromHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (el && el.tagName === 'DETAILS') {
        el.open = true;
        el.scrollIntoView();
      }
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);
}

export default function FaqPage() {
  useOpenFaqFromHash();
  return (
    <div className="content-page">
      <ContentHeader />

      <main>

      <section className="content-hero">
        <div className="content-hero-inner">
          <h1>FAQ : CV, ATS et IA</h1>
          <p className="content-lead">
            Les réponses aux questions que tout le monde se pose - avec ce que disent les études et les enquêtes recruteurs.
          </p>
        </div>
      </section>

      <section className="content-section" data-section="faq">
        <div className="content-section-inner faq-inner">
          {FAQ_ITEMS.map((item) => (
            <details key={item.slug} id={item.slug} className="faq-item">
              <summary>
                <h2 className="faq-question" {...analyticsAttrs(`faq-question-${item.slug}`, 'faq', 'tertiary')}>{item.q}</h2>
              </summary>
              <div className="faq-answer">{item.a}</div>
            </details>
          ))}
        </div>
      </section>

      </main>

      <ContentCta signupId="faq-cta-signup" />

      <ContentFooter />
      <ContentScrollToTop />
    </div>
  );
}
