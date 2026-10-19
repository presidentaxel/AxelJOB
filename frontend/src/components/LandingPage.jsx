import { useCallback, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CONTACT_EMAIL } from '../constants';
import {
  BENEFITS,
  FEATURES,
  FREE_FEATURES,
  HERO_REASSURE,
  PRO_FEATURES,
  STEPS,
  landingCopyright,
  landingText,
} from '../content/landingCopy.js';
import { LANDING_FAQ_ITEMS } from '../content/faqItems.js';
import { analyticsAttrs } from '../lib/analyticsAttrs.js';
import { persistLoginCta } from '../../public/signupAttribution.js';
import Button from './ui/Button.jsx';
import FaqAnswer from './FaqAnswer.jsx';
import PublicHeader from './PublicHeader.jsx';
import './LandingPage.css';

const ICON_PATHS = {
  profile: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  paste: (
    <>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
    </>
  ),
  sparkles: <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />,
  list: (
    <>
      <path d="m3 17 2 2 4-4" />
      <path d="m3 7 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
};

function CardIcon({ name }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
  );
}

export default function LandingPage({ onCtaClick, onProClick }) {
  const { hash } = useLocation();
  const goLogin = useCallback(
    (dataAttr, then) => {
      persistLoginCta(dataAttr);
      then?.();
    },
    [],
  );

  // Arrivée depuis une autre page publique par /#tarifs : on rejoint l'ancre une fois la page montée.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="landing">
      <PublicHeader />

      <main id="main-content">
      <section className="landing-hero" data-section="hero">
        <div className="landing-container">
          <div className="landing-hero-inner">
            <div className="landing-hero-content">
              <p className="landing-kicker">{landingText.heroKicker}</p>
              <h1 className="landing-hero-title ds-display-xl" {...analyticsAttrs('home-hero-title', 'hero', 'tertiary')}>
                {landingText.heroTitleBefore}
                <em className="ds-highlight">{landingText.heroTitleHighlight}</em>
                {landingText.heroTitleAfter}
              </h1>
              <p className="landing-hero-subtitle">
                {landingText.heroSubtitle}
              </p>
              <div className="landing-hero-ctas">
                <Button type="button" variant="primary" size="lg" className="landing-cta-hero" onClick={() => goLogin('home-hero-cta-signup', onCtaClick)} {...analyticsAttrs('home-hero-cta-signup', 'hero', 'primary', 'cta')}>
                  {landingText.ctaTry}
                </Button>
                <Button as="a" href="#comment" variant="secondary" size="lg" {...analyticsAttrs('home-hero-cta-how', 'hero', 'secondary', 'nav')}>
                  {landingText.ctaHow}
                </Button>
              </div>
              <ul className="landing-reassure">
                {HERO_REASSURE.map((item) => (
                  <li key={item}><CheckIcon />{item}</li>
                ))}
              </ul>
            </div>
            <div className="landing-hero-visual" aria-hidden="true">
              <div className="landing-hero-mockup">
                <div className="mockup-toolbar">
                  <span className="mockup-dot" /><span className="mockup-dot" /><span className="mockup-dot" />
                  <span className="mockup-title">{landingText.mockupTitle}</span>
                </div>
                <div className="mockup-body">
                  <div className="mockup-chat">
                    <div className="mockup-msg mockup-msg--user">{landingText.mockupUser}</div>
                    <div className="mockup-msg mockup-msg--ai">
                      <span className="mockup-ai-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{ICON_PATHS.sparkles}</svg></span>
                      {landingText.mockupAi}
                    </div>
                  </div>
                  <div className="mockup-preview">
                    <div className="mockup-score">
                      <span className="mockup-score-label">{landingText.mockupScoreLabel}</span>
                      <span className="mockup-score-value">{landingText.mockupScoreValue}</span>
                      <div className="mockup-score-bar" />
                    </div>
                    <div className="mockup-paper">
                      <div className="mockup-cv-header" />
                      <div className="mockup-cv-sub" />
                      <div className="mockup-cv-line mockup-cv-line--highlight" />
                      <div className="mockup-cv-line" />
                      <div className="mockup-cv-line mockup-cv-line--short" />
                      <div className="mockup-cv-line mockup-cv-line--highlight" />
                      <div className="mockup-cv-line" />
                      <div className="mockup-cv-line mockup-cv-line--short" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="comment" className="landing-section" data-section="how">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-eyebrow">{landingText.howKicker}</p>
            <h2 className="landing-section-title ds-heading-xl">{landingText.howTitle}</h2>
          </div>
          <ol className="landing-steps">
            {STEPS.map((step, i) => (
              <li key={step.icon} className="landing-step">
                <span className="landing-step-num" aria-hidden="true">{`0${i + 1}`}</span>
                <h3 className="landing-step-title ds-heading-sm">{step.title}</h3>
                <p className="landing-step-desc">{step.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="tarifs" className="landing-section landing-section--inverse" data-section="pricing">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-eyebrow">{landingText.pricingKicker}</p>
            <h2 className="landing-section-title ds-heading-xl">{landingText.pricingTitle}</h2>
            <p className="landing-section-subtitle">{landingText.pricingSubtitle}</p>
          </div>
          <div className="landing-pricing">
            <div className="pricing-card" {...analyticsAttrs('home-pricing-card-free', 'pricing', 'tertiary')}>
              <div className="pricing-card-header">
                <h3 className="pricing-plan-name">{landingText.planFree}</h3>
                <div className="pricing-price">
                  <span className="pricing-amount">{landingText.priceFree}</span>
                  <span className="pricing-period">{landingText.periodFree}</span>
                </div>
              </div>
              <ul className="pricing-features">
                {FREE_FEATURES.map((f) => (
                  <li key={f}>
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
              <Button type="button" variant="secondary" tone="inverse" size="lg" className="pricing-cta" onClick={() => goLogin('home-pricing-cta-free', onCtaClick)} {...analyticsAttrs('home-pricing-cta-free', 'pricing', 'secondary', 'cta')}>
                {landingText.ctaFree}
              </Button>
            </div>

            <div className="pricing-card pricing-card--pro" {...analyticsAttrs('home-pricing-card-pro', 'pricing', 'tertiary')}>
              <div className="pricing-badge" {...analyticsAttrs('home-pricing-badge-popular', 'pricing', 'tertiary')}>{landingText.badgePopular}</div>
              <div className="pricing-card-header">
                <h3 className="pricing-plan-name">{landingText.planPro}</h3>
                <div className="pricing-price">
                  <span className="pricing-amount">{landingText.pricePro}</span>
                  <span className="pricing-period">{landingText.periodPro}</span>
                </div>
              </div>
              <ul className="pricing-features">
                {PRO_FEATURES.map((f) => (
                  <li key={f}>
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
              <Button type="button" variant="primary" size="lg" className="pricing-cta" onClick={() => goLogin('home-pricing-cta-pro', onProClick || onCtaClick)} {...analyticsAttrs('home-pricing-cta-pro', 'pricing', 'primary', 'cta')}>
                {landingText.ctaPro}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section landing-section--subtle" data-section="features">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-eyebrow">{landingText.featuresKicker}</p>
            <h2 className="landing-section-title ds-heading-xl">{landingText.featuresTitle}</h2>
          </div>
          <div className="landing-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="landing-feature-card">
                <div className="landing-card-icon"><CardIcon name={f.icon} /></div>
                <h3 className="landing-feature-title ds-heading-sm">{f.title}</h3>
                <p className="landing-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" data-section="why">
        <div className="landing-container">
          <div className="landing-audience">
            <div className="landing-section-head">
              <p className="landing-eyebrow">{landingText.whyKicker}</p>
              <h2 className="landing-section-title ds-heading-xl">{landingText.whyTitle}</h2>
            </div>
            <ul className="landing-audience-list">
              {BENEFITS.map((b) => (
                <li key={b.title}>
                  <h3 className="landing-audience-title">{b.title}</h3>
                  <p className="landing-feature-desc">{b.desc}</p>
                  {b.linkToAts && (
                    <Link to="/ats" className="landing-ats-link" {...analyticsAttrs('home-why-link-ats', 'why', 'tertiary', 'nav')}>{landingText.atsLink}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="faq" className="landing-section landing-section--subtle" data-section="faq">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-eyebrow">{landingText.faqKicker}</p>
            <h2 className="landing-section-title ds-heading-xl">{landingText.faqTitle}</h2>
          </div>
          <div className="landing-faq">
            {LANDING_FAQ_ITEMS.map((item) => (
              <details key={item.slug} className="landing-faq-item">
                <summary>
                  <h3 className="landing-faq-question">{item.q}</h3>
                </summary>
                <div className="landing-faq-answer">
                  <FaqAnswer paragraphs={item.a} linkClassName="landing-faq-source" />
                </div>
              </details>
            ))}
          </div>
          <p className="landing-faq-more">
            <Link to="/faq" className="landing-faq-link" {...analyticsAttrs('home-faq-link-all', 'faq', 'tertiary', 'nav')}>{landingText.faqAll}</Link>
          </p>
        </div>
      </section>

      <section className="landing-cta-bottom" data-section="final">
        <div className="landing-container">
          <h2 className="ds-heading-xl">{landingText.finalTitle}</h2>
          <p>{landingText.finalSubtitle}</p>
          <div className="landing-cta-actions">
            <Button type="button" variant="primary" size="lg" className="landing-cta-hero" onClick={() => goLogin('home-final-cta-signup', onCtaClick)} {...analyticsAttrs('home-final-cta-signup', 'final', 'primary', 'cta')}>
              {landingText.ctaTry}
            </Button>
            <Button as="a" href="#tarifs" variant="secondary" tone="inverse" size="lg" {...analyticsAttrs('home-final-cta-pricing', 'final', 'secondary', 'nav')}>
              {landingText.ctaSeePricing}
            </Button>
          </div>
        </div>
      </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-cols">
            <div className="landing-footer-brand">
              <Link to="/" className="landing-brand-link" {...analyticsAttrs('footer-link-home', 'footer', 'tertiary', 'nav')}>
                <img src="/favicon.svg" alt="" className="landing-logo" width="36" height="36" />
                <span className="landing-brand">{landingText.brand}</span>
              </Link>
            </div>
            <nav aria-label={landingText.footerColGuides}>
              <p className="landing-footer-heading">{landingText.footerColGuides}</p>
              <ul className="landing-footer-list">
                <li><Link to="/ats" {...analyticsAttrs('footer-link-ats', 'footer', 'tertiary', 'nav')}>{landingText.footerAts}</Link></li>
                <li><Link to="/faq" {...analyticsAttrs('footer-link-faq', 'footer', 'tertiary', 'nav')}>{landingText.footerFaq}</Link></li>
                <li><Link to="/modeles-cv" {...analyticsAttrs('footer-link-modeles', 'footer', 'tertiary', 'nav')}>{landingText.footerModeles}</Link></li>
                <li><Link to="/guide-cv" {...analyticsAttrs('footer-link-guide', 'footer', 'tertiary', 'nav')}>{landingText.footerGuide}</Link></li>
              </ul>
            </nav>
            <nav aria-label={landingText.navResources}>
              <p className="landing-footer-heading">{landingText.navResources}</p>
              <ul className="landing-footer-list">
                <li><Link to="/erreurs-cv" {...analyticsAttrs('footer-link-erreurs', 'footer', 'tertiary', 'nav')}>{landingText.footerErreurs}</Link></li>
                <li><Link to="/cv-par-metier" {...analyticsAttrs('footer-link-metier', 'footer', 'tertiary', 'nav')}>{landingText.footerMetier}</Link></li>
                <li><Link to="/cv-adapte-chaque-offre" {...analyticsAttrs('footer-link-adapte', 'footer', 'tertiary', 'nav')}>{landingText.footerAdapte}</Link></li>
              </ul>
            </nav>
            <nav aria-label={landingText.footerColHelp}>
              <p className="landing-footer-heading">{landingText.footerColHelp}</p>
              <ul className="landing-footer-list">
                <li><a href={`mailto:${CONTACT_EMAIL}?subject=Support%20AxeL%20Job`} {...analyticsAttrs('footer-link-support', 'footer', 'tertiary', 'nav')}>{landingText.footerSupport}</a></li>
                <li>
                  <a
                    href="/login"
                    onClick={(e) => {
                      e.preventDefault();
                      goLogin('footer-link-login', onCtaClick);
                    }}
                    {...analyticsAttrs('footer-link-login', 'footer', 'tertiary', 'nav')}
                  >
                    {landingText.ctaLogin}
                  </a>
                </li>
              </ul>
            </nav>
          </div>
          <div className="landing-footer-bottom">
            <p data-landing-copyright>
              {landingCopyright(new Date().getFullYear())}{' '}
              <a href="https://axelproject.fr" rel="noopener noreferrer" {...analyticsAttrs('footer-link-axelproject', 'footer', 'tertiary', 'nav')}>{landingText.footerBrand}</a>.
            </p>
            <nav className="landing-footer-legal" aria-label="Pages légales">
              <Link to="/mentions-legales" {...analyticsAttrs('footer-link-mentions', 'footer', 'tertiary', 'nav')}>{landingText.legalMentions}</Link>
              <Link to="/confidentialite" {...analyticsAttrs('footer-link-confidentialite', 'footer', 'tertiary', 'nav')}>{landingText.legalPrivacy}</Link>
              <Link to="/cgu" {...analyticsAttrs('footer-link-cgu', 'footer', 'tertiary', 'nav')}>{landingText.legalTerms}</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
