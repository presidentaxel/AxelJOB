import { useCallback, useEffect, useState } from 'react';
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
      setData(next);
    } catch (err) {
      setData(null);
      setError(err?.message || 'Impossible de charger les comptes.');
    } finally {
      setLoading(false);
    }
  }, [payingOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const openHistory = async (userId) => {
    setHistoryError('');
    setHistory({ userId, loading: true, signIns: [] });
    try {
      const next = await apiGet(`/api/admin/monitoring/accounts/${userId}/sign-ins`);
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
      <label className="monitoring-days-label">
        <input
          type="checkbox"
          checked={payingOnly}
          onChange={(event) => setPayingOnly(event.target.checked)}
        />{' '}
        Comptes qui paient encore
      </label>
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
              {accounts.map((account) => (
                <tr key={account.user_id}>
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
                      onClick={() => openHistory(account.user_id)}
                    >
                      Voir
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {history && (
        <div className="monitoring-section">
          <h3 className="monitoring-subhead">Historique {shortId(history.userId)}</h3>
          {history.loading && <p className="monitoring-muted">Chargement…</p>}
          {!history.loading && history.signIns.length === 0 && (
            <p className="monitoring-muted">Aucune connexion enregistrée sur les 12 derniers mois.</p>
          )}
          {!history.loading && history.signIns.length > 0 && (
            <ul className="monitoring-news-list">
              {history.signIns.map((iso) => (
                <li key={iso} className="monitoring-news-card">
                  {formatWhen(iso)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
