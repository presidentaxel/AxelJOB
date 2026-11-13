import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiGet } from '../api';
import Button from './ui/Button.jsx';

function formatWhen(iso) {
  if (!iso) return 'Jamais';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Jamais';
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function shortId(userId) {
  const value = String(userId || '');
  if (value.length <= 10) return value || '—';
  return `${value.slice(0, 8)}…`;
}

function marker(account) {
  if (account.inactive_90) return 'Plus de 90 jours';
  if (account.inactive_60) return 'Plus de 60 jours';
  return 'Récent';
}

/**
 * Vue admin des connexions. Aucun e-mail n'est demandé ni affiché.
 */
export default function MonitoringAccounts() {
  const location = useLocation();
  const visible = location.pathname.startsWith('/app/monitoring');
  const [payingOnly, setPayingOnly] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const next = await apiGet(
        `/api/admin/monitoring/accounts?paying_only=${payingOnly ? 'true' : 'false'}`,
      );
      if (next?.available === false) {
        setData(next);
        setError(next.message || 'Historique des connexions indisponible.');
        return;
      }
      setData(next);
    } catch (err) {
      setData(null);
      setError(err?.message || 'Impossible de charger les comptes.');
    } finally {
      setLoading(false);
    }
  }, [payingOnly]);

  useEffect(() => {
    if (!visible) return undefined;
    load();
    return undefined;
  }, [load, visible]);

  const openHistory = async (userId) => {
    setHistoryError('');
    setHistory({ userId, loading: true, signIns: [] });
    try {
      const next = await apiGet(`/api/admin/monitoring/accounts/${userId}/sign-ins`);
      if (next?.available === false) {
        setHistory(null);
        setHistoryError(next.message || 'Historique indisponible.');
        return;
      }
      setHistory({ userId, loading: false, signIns: next?.sign_ins || [] });
    } catch (err) {
      setHistory(null);
      setHistoryError(err?.message || 'Historique indisponible.');
    }
  };

  const accounts = data?.accounts || [];

  return (
    <section className="monitoring-section">
      <h2 className="support-section-title">Connexions</h2>
      <p className="monitoring-muted">
        Dernière connexion et dernière action sur un CV, une candidature ou une adaptation.
        L&apos;historique est conservé {data?.retention_months || 12} mois. Aucun e-mail n&apos;est affiché.
      </p>
      <div className="monitoring-account-filter">
        <span className="ds-label-sm" id="monitoring-account-filter-label">Afficher</span>
        <div
          className="monitoring-account-filter-group"
          role="group"
          aria-labelledby="monitoring-account-filter-label"
        >
          <Button
            type="button"
            size="sm"
            variant={payingOnly ? 'primary' : 'secondary'}
            aria-pressed={payingOnly}
            onClick={() => setPayingOnly(true)}
          >
            Qui paient encore
          </Button>
          <Button
            type="button"
            size="sm"
            variant={payingOnly ? 'secondary' : 'primary'}
            aria-pressed={!payingOnly}
            onClick={() => setPayingOnly(false)}
          >
            Tous les comptes
          </Button>
        </div>
      </div>
      {error && <p className="monitoring-error">{error}</p>}
      {historyError && <p className="monitoring-error">{historyError}</p>}
      {loading && <p className="monitoring-muted">Chargement…</p>}
      {!loading && !error && (
        <div className="monitoring-table-wrap">
          <table className="monitoring-table">
            <thead>
              <tr>
                <th>Compte</th>
                <th>Plan</th>
                <th>Dernière connexion</th>
                <th>Dernière action</th>
                <th>Repère</th>
                <th>Historique</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="monitoring-muted">
                    {payingOnly ? 'Aucun compte payant.' : 'Aucun compte.'}
                  </td>
                </tr>
              )}
              {accounts.map((account) => {
                const open = history?.userId === account.user_id;
                return (
                  <tr key={account.user_id} className={open ? 'monitoring-table-row--selected' : undefined}>
                    <td title={account.user_id}>{shortId(account.user_id)}</td>
                    <td>{account.paying ? 'Payant' : account.plan || 'free'}</td>
                    <td>{formatWhen(account.last_sign_in_at)}</td>
                    <td>{formatWhen(account.last_product_at)}</td>
                    <td>{marker(account)}</td>
                    <td>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        aria-expanded={open}
                        onClick={() => (open ? setHistory(null) : openHistory(account.user_id))}
                      >
                        {open ? 'Masquer' : 'Voir'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {history && (
        <aside className="monitoring-history" aria-live="polite">
          <div className="monitoring-history-head">
            <h3 className="ds-label-md">Historique</h3>
            <span className="ds-mono-sm" title={history.userId}>{shortId(history.userId)}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setHistory(null)}>
              Fermer
            </Button>
          </div>
          {history.loading && <p className="monitoring-history-empty ds-body-md">Chargement…</p>}
          {!history.loading && history.signIns.length === 0 && (
            <p className="monitoring-history-empty ds-body-md">
              Aucune connexion sur les 12 derniers mois. Une reconnexion ajoute une ligne ici.
            </p>
          )}
          {!history.loading && history.signIns.length > 0 && (
            <ul className="monitoring-history-list">
              {history.signIns.map((iso) => (
                <li key={iso} className="ds-body-md">{formatWhen(iso)}</li>
              ))}
            </ul>
          )}
        </aside>
      )}
    </section>
  );
}
