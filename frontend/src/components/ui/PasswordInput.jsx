import { useState } from 'react';
import Input from './Input.jsx';

function EyeIcon({ off }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75">
      {off ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.5 10.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-1" />
          <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 3.5 10 7-1 2.2-2.6 4-4.6 5.3" />
          <path d="M6.1 6.8C4.2 8.1 2.8 9.9 2 12c1.5 3.5 5 7 10 7 1.1 0 2.1-.2 3.1-.5" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/**
 * Mot de passe masqué par défaut.
 * L'œil est décalé du bord droit pour laisser l'icône Bitwarden cliquable.
 */
export default function PasswordInput({ className = '', ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-password-field">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={className}
      />
      <button
        type="button"
        className="auth-password-toggle"
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
      >
        <EyeIcon off={visible} />
      </button>
    </div>
  );
}
