import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from './ui/Button.jsx';
import PublicHeader from './PublicHeader.jsx';
import { ContentFooter } from './ContentChrome.jsx';
import { analyticsAttrs } from '../lib/analyticsAttrs.js';
import { persistLoginCta } from '../../public/signupAttribution.js';
import { loginNavOptions } from '../lib/publicEntry.js';
import { setNotFoundRobots } from '../lib/seoHead.js';

/**
 * Page 404 de la SPA (URL inconnue). Même charte que public/404.html : kicker, titre Fraunces
 * avec mot surligné, texte d'aide, boutons Accueil / Connexion. noindex (voir seoHead.js).
 */
export default function NotFoundPage() {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = 'Page introuvable (404) | AxeL Job';
    return setNotFoundRobots();
  }, []);
  return (
    <div className="content-page">
      <PublicHeader />
      <main className="error-static-main" id="main-content">
        <section className="content-hero">
          <div className="content-hero-inner">
            <p className="content-kicker">Erreur 404</p>
            <h1>Page <em className="ds-highlight">introuvable</em></h1>
            <p className="content-lead">
              Cette adresse n&apos;existe pas ou a été déplacée. Vérifie l&apos;URL ou reviens à l&apos;accueil.
            </p>
            <div className="error-static-actions">
              <Button variant="primary" onClick={() => navigate('/')} {...analyticsAttrs('error-cta-home', 'error', 'primary', 'cta')}>
                Accueil
              </Button>
              <Button variant="secondary" onClick={() => { persistLoginCta('error-cta-login'); navigate('/login', loginNavOptions()); }} {...analyticsAttrs('error-cta-login', 'error', 'secondary', 'cta')}>
                Connexion
              </Button>
            </div>
          </div>
        </section>
      </main>
      <ContentFooter />
    </div>
  );
}
