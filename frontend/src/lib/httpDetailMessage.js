/** Message affichable à partir d'un `detail` FastAPI (string, liste ou {message, reason}). */
export function httpDetailMessage(detail, fallback = '') {
  if (Array.isArray(detail)) {
    return detail[0]?.msg || JSON.stringify(detail);
  }
  if (detail && typeof detail === 'object') {
    return detail.message || detail.reason || JSON.stringify(detail);
  }
  return detail || fallback;
}
