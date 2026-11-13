import { useEffect } from 'react';
import { FAQ_ITEMS } from '../content/faqItems.js';
import { landingText } from '../content/landingCopy.js';
import { analyticsAttrs } from '../lib/analyticsAttrs.js';
import ContentScrollToTop from './ContentScrollToTop';
import FaqAnswer from './FaqAnswer.jsx';
import { ContentHeader, ContentHeroTitle, ContentCta, ContentFooter } from './ContentChrome.jsx';

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
          <ContentHeroTitle kicker={landingText.footerFaq} title="FAQ : CV, ATS et IA" highlight="IA" />
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
              <div className="faq-answer"><FaqAnswer paragraphs={item.a} /></div>
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
