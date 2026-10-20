import { useEffect } from 'react';
import Button from './ui/Button.jsx';
import { CHUNK_UPDATE_MESSAGE, userFacingHttpMessage } from '../lib/userFacingError.js';

/** Page 404 (SPA) : voir NotFoundPage.jsx. */

function setNoindexFollow() {
  if (typeof document === 'undefined') return;
  let el = document.querySelector('meta[name="robots"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'robots');
    document.head.appendChild(el);
  }
  el.setAttribute('content', 'noindex, follow');
}

/** Page 500 - erreur React non gérée (Error Boundary) */
export function ServerErrorPage({ onRetry, chunk = false }) {
  useEffect(() => {
    document.title = 'Erreur (500) | AxeL Job';
    setNoindexFollow();
  }, []);
  return (
    <div className="login-screen">
      <div className="login-screen-card" style={{ textAlign: 'center' }}>
        <img src="/favicon.svg" alt="AxeL Job" className="login-screen-logo" />
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--ds-color-text-muted)', letterSpacing: '0.06em' }}>
          Erreur
        </p>
        <h1>{chunk ? 'Mise à jour' : 'Un problème est survenu'}</h1>
        <p className="login-screen-intro">
          {chunk ? CHUNK_UPDATE_MESSAGE : userFacingHttpMessage(500, '')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center', marginTop: '1.25rem' }}>
          {typeof onRetry === 'function' && (
            <Button variant="primary" onClick={onRetry}>
              Réessayer
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Recharger la page
          </Button>
          <Button variant="tertiary" onClick={() => window.location.assign('/')}>
            Recharger l&apos;accueil
          </Button>
        </div>
      </div>
    </div>
  );
}
