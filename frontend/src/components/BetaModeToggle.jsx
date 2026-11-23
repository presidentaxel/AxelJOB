import '../styles/BetaModeToggle.css';

import { useBetaMode } from '../lib/useBetaMode.js';

/**
 * Toggle Stable / Beta affiché dans la topbar.
 *
 * - Stable : version actuelle de l'application (formulaires, ProfileView,
 *   parcours existant). Comportement par défaut tant que l'utilisateur n'a
 *   pas opt-in.
 * - Beta : nouvelle expérience d'édition décrite dans `docs/editor-vision.md`
 *   (édition inline L1, mise en page configurable L2, canvas libre L3, score
 *   ATS en temps réel).
 *
 * La persistance est gérée par `lib/betaMode.js` (localStorage).
 * Les autres composants peuvent lire l'état via `useBetaMode()` ou
 * `isBetaModeEnabled()` sans avoir besoin de prop drilling.
 */
export default function BetaModeToggle() {
  const [enabled, setEnabled] = useBetaMode();

  const handleChange = (event) => {
    setEnabled(event.target.checked);
  };

  return (
    <label
      className={`beta-mode-toggle ${enabled ? 'beta-mode-toggle--on' : ''}`}
      title="Bascule entre l’éditeur classique et le nouvel éditeur (édition directe sur le CV, score ATS, mise en page libre). Réversible à tout moment."
    >
      <span className="beta-mode-toggle-label-left">Classique</span>
      <input
        type="checkbox"
        role="switch"
        aria-label={enabled ? 'Revenir à l’éditeur classique' : 'Activer le nouvel éditeur'}
        aria-checked={enabled}
        checked={enabled}
        onChange={handleChange}
        className="beta-mode-toggle-checkbox"
        data-testid="beta-mode-toggle-input"
      />
      <span className="beta-mode-toggle-track" aria-hidden="true">
        <span className="beta-mode-toggle-thumb" />
      </span>
      <span className="beta-mode-toggle-label-right">
        Nouvel éditeur
        {enabled && <span className="beta-mode-toggle-badge">NEW</span>}
      </span>
    </label>
  );
}
