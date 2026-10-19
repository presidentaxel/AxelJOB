/**
 * Éléments communs des pages de contenu (AXE-470) : nav, sommaire, CTA de fin de page, pied de page.
 * Défini une fois, utilisé par AtsPage, FaqPage, ArticlesPages et LegalPages.
 * Le HTML statique de public/*.html reproduit ce balisage à l'identique (voir tests/unit/axe470SeoPages.test.js).
 */
import { Link } from 'react-router-dom';
import { CONTACT_EMAIL } from '../constants';
import { landingCopyright, landingText } from '../content/landingCopy.js';
import { analyticsAttrs } from '../lib/analyticsAttrs.js';
import { persistLoginCta } from '../../public/signupAttribution.js';
import Button from './ui/Button.jsx';
import './ContentPages.css';

const GUIDE_LINKS = [
  { to: '/ats', id: 'footer-link-ats', label: landingText.footerAts },
  { to: '/faq', id: 'footer-link-faq', label: landingText.footerFaq },
  { to: '/modeles-cv', id: 'footer-link-modeles', label: landingText.footerModeles },
  { to: '/guide-cv', id: 'footer-link-guide', label: landingText.footerGuide },
  { to: '/erreurs-cv', id: 'footer-link-erreurs', label: landingText.footerErreurs },
  { to: '/cv-par-metier', id: 'footer-link-metier', label: landingText.footerMetier },
  { to: '/cv-adapte-chaque-offre', id: 'footer-link-adapte', label: landingText.footerAdapte },
];

const LEGAL_LINKS = [
  { to: '/mentions-legales', id: 'footer-link-mentions', label: landingText.legalMentions },
  { to: '/confidentialite', id: 'footer-link-confidentialite', label: landingText.legalPrivacy },
  { to: '/cgu', id: 'footer-link-cgu', label: landingText.legalTerms },
];

const HEADER_LINKS = [
  { to: '/ats', id: 'nav-link-ats', label: landingText.footerAts },
  { to: '/faq', id: 'nav-link-faq', label: landingText.footerFaq },
  { to: '/modeles-cv', id: 'nav-link-modeles', label: landingText.navModelesShort },
  { to: '/guide-cv', id: 'nav-link-guide', label: landingText.navGuide },
];

function Brand({ id, zone }) {
  return (
    <Link to="/" className="content-brand" {...analyticsAttrs(id, zone, 'tertiary', 'nav')}>
      <img src="/favicon.svg" alt="" className="content-logo" width="36" height="36" />
      <span>{landingText.brand}</span>
    </Link>
  );
}

/** Nav fixe : logo, liens de section, Se connecter, CTA vers /login, burger sous 900px. */
export function ContentHeader() {
  const links = (prefix) =>
    HEADER_LINKS.map((link) => (
      <Link key={link.to} to={link.to} {...analyticsAttrs(link.id.replace('nav-link-', prefix), 'header', 'tertiary', 'nav')}>
        {link.label}
      </Link>
    ));
  return (
    <header className="content-header">
      <div className="content-header-inner">
        <Brand id="nav-link-back" zone="header" />
        <nav className="content-nav" aria-label="Navigation principale">
          <div className="content-nav-links">{links('nav-link-')}</div>
          <div className="content-nav-actions">
            <Button
              as={Link}
              to="/login"
              variant="tertiary"
              className="content-nav-login"
              onClick={() => persistLoginCta('nav-link-login')}
              {...analyticsAttrs('nav-link-login', 'header', 'tertiary', 'nav')}
            >
              {landingText.ctaLogin}
            </Button>
            <Button
              as={Link}
              to="/login"
              variant="primary"
              onClick={() => persistLoginCta('nav-cta-signup')}
              {...analyticsAttrs('nav-cta-signup', 'header', 'primary', 'cta')}
            >
              Essayer<span className="content-cta-long"> gratuitement</span>
            </Button>
          </div>
        </nav>
        <details className="content-burger">
          <summary aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </summary>
          <div className="content-burger-panel">
            {links('nav-drawer-')}
            <Link to="/login" onClick={() => persistLoginCta('nav-drawer-login')} {...analyticsAttrs('nav-drawer-login', 'header', 'tertiary', 'nav')}>
              {landingText.ctaLogin}
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}

/** Sommaire d'ancres (pages de 4 sections ou plus). items : [{ id, label }]. */
export function ContentToc({ items }) {
  if (!items || items.length < 4) return null;
  return (
    <div className="content-toc-wrap">
      <nav className="content-toc" aria-label="Sommaire">
        <p className="content-toc-title">Sommaire</p>
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>{item.label}</a>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

/** Bande encre + bouton orange vers /login. */
export function ContentCta({
  signupId,
  title = 'Un CV adapté à chaque offre, en un clic',
  text = 'Essaie AxeL Job gratuitement. 3 adaptations offertes, sans carte bancaire.',
  label = 'Essayer gratuitement',
}) {
  return (
    <section className="content-cta" data-section="content-cta">
      <div className="content-cta-inner">
        <h2>{title}</h2>
        <p>{text}</p>
        <Button
          as={Link}
          to="/login"
          variant="primary"
          size="lg"
          onClick={() => persistLoginCta(signupId)}
          {...analyticsAttrs(signupId, 'content', 'primary', 'cta')}
        >
          {label}
        </Button>
      </div>
    </section>
  );
}

function FooterColumn({ title, links }) {
  return (
    <nav className="content-footer-col" aria-label={title}>
      <p className="content-footer-title">{title}</p>
      <ul>
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} {...analyticsAttrs(link.id, 'footer', 'tertiary', 'nav')}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Pied de page : grille 1,4fr + 3 colonnes, barre basse (copyright + légal). */
export function ContentFooter() {
  return (
    <footer className="content-footer">
      <div className="content-footer-inner">
        <div className="content-footer-brand">
          <Brand id="footer-link-home" zone="footer" />
        </div>
        <FooterColumn title="Guides" links={GUIDE_LINKS.slice(0, 4)} />
        <FooterColumn title="Ressources" links={GUIDE_LINKS.slice(4)} />
        <nav className="content-footer-col" aria-label="Aide">
          <p className="content-footer-title">Aide</p>
          <ul>
            <li>
              <a href={`mailto:${CONTACT_EMAIL}?subject=Support%20AxeL%20Job`} {...analyticsAttrs('footer-link-support', 'footer', 'tertiary', 'nav')}>{landingText.footerSupport}</a>
            </li>
            <li>
              <Link to="/login" onClick={() => persistLoginCta('footer-link-login')} {...analyticsAttrs('footer-link-login', 'footer', 'tertiary', 'nav')}>{landingText.ctaLogin}</Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="content-footer-bar">
        <p className="content-footer-copy">
          {landingCopyright(new Date().getFullYear())}{' '}
          <a href="https://axelproject.fr" rel="noopener noreferrer" {...analyticsAttrs('footer-link-axelproject', 'footer', 'tertiary', 'nav')}>{landingText.footerBrand}</a>.
        </p>
        <nav className="content-footer-legal" aria-label="Pages légales">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.to} to={link.to} {...analyticsAttrs(link.id, 'footer', 'tertiary', 'nav')}>{link.label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
