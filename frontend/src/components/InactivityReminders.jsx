import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api';
import Button from './ui/Button.jsx';

function formatWhen(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function shortId(userId) {
  const value = String(userId || '');
  if (value.length <= 10) return value || '—';
  return `${value.slice(0, 8)}…`;
}

/**
 * Rappels de résiliation. L'admin voit des identifiants et des dates, pas les adresses.
 */
export default function InactivityReminders() {
  const [days, setDays] = useState(90);
  const [preview, setPreview] = useState(null);
  const [journal, setJournal] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const loadJournal = useCallback(async () => {
    const data = await apiGet('/api/admin/inactivity-reminders/journal');
    setJournal(data?.items || []);
  }, []);

  useEffect(() => {
    loadJournal().catch((err) => {
      setError(err?.message || 'Journal indisponible.');
    });
  }, [loadJournal]);

  const previewRecipients = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const data = await apiGet(`/api/admin/inactivity-reminders?days=${days}`);
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err?.message || 'Prévisualisation impossible.');
    } finally {
      setBusy(false);
    }
  };

  const sendReminders = async () => {
    const confirmed = window.confirm(
      `Envoyer le rappel aux comptes payants inactifs depuis ${days} jours ?`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const data = await apiPost(`/api/admin/inactivity-reminders/send?days=${days}`, {});
      setInfo(`${data?.sent_count || 0} mail${data?.sent_count === 1 ? '' : 's'} envoyé${data?.sent_count === 1 ? '' : 's'}.`);
      setPreview(null);
      await loadJournal();
    } catch (err) {
      setError(err?.message || 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiPost('/api/admin/inactivity-reminders/test', {});
      setInfo('Mail de test envoyé sur la session admin. Aucun abonné n’a été contacté.');
      await loadJournal();
    } catch (err) {
      setError(err?.message || 'Envoi de test impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="monitoring-section">
      <h2 className="support-section-title">Rappels de résiliation</h2>
      <p className="monitoring-muted">
        Comptes payants sans connexion et sans action produit. Le mail ouvre le compte, il ne résilie pas.
        Le journal garde la date et le compte, pas le contenu du mail.
      </p>
      <label className="monitoring-days-label">
        Seuil
        <select
          className="input-field monitoring-days-select"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value={90}>90 jours</option>
          <option value={60}>60 jours</option>
        </select>
      </label>
      <div className="monitoring-toolbar">
        <Button type="button" variant="secondary" size="sm" onClick={previewRecipients} disabled={busy}>
          Prévisualiser
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={sendTest} disabled={busy}>
          M&apos;envoyer un essai
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={sendReminders} disabled={busy}>
          Envoyer les rappels
        </Button>
      </div>
      {error && <p className="monitoring-error">{error}</p>}
      {info && <p className="monitoring-muted">{info}</p>}
      {preview && (
        <p className="monitoring-muted">
          {preview.eligible_count} compte{preview.eligible_count === 1 ? '' : 's'} éligible
          {preview.eligible_count === 1 ? '' : 's'}
          {preview.truncated ? ' (envoi plafonné)' : ''}.
        </p>
      )}
      <div className="monitoring-table-wrap">
        <table className="monitoring-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Compte</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {journal.length === 0 && (
              <tr>
                <td colSpan={3} className="monitoring-muted">Aucun envoi.</td>
              </tr>
            )}
            {journal.map((item) => (
              <tr key={`${item.sent_at}-${item.user_id}-${item.kind}`}>
                <td>{formatWhen(item.sent_at)}</td>
                <td title={item.user_id}>{shortId(item.user_id)}</td>
                <td>{item.kind === 'test' ? 'Essai' : 'Rappel'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
