import { useEffect, useRef, useState } from 'react';
import { HiPencil } from 'react-icons/hi2';

/**
 * Ligne de texte soulignée. Le crayon ouvre la saisie de ce champ seulement.
 */
export default function InlineEdit({
  label,
  value,
  onChange,
  placeholder = 'Ajouter',
  type = 'text',
  multiline = false,
  rows = 3,
  title,
  className = '',
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const shown = (value ?? '').toString();
  const empty = shown.trim() === '';

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const len = el.value?.length ?? 0;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* certains types (email) n’exposent pas la sélection */
    }
  }, [editing]);

  const stop = () => setEditing(false);

  const editor = multiline ? (
    <textarea
      ref={inputRef}
      className="profile-inline-input"
      rows={rows}
      value={shown}
      placeholder={placeholder}
      aria-label={label || placeholder}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      onBlur={stop}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          stop();
        }
      }}
    />
  ) : (
    <input
      ref={inputRef}
      className="profile-inline-input"
      type={type}
      value={shown}
      placeholder={placeholder}
      aria-label={label || placeholder}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      onBlur={stop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          stop();
        }
      }}
    />
  );

  return (
    <div className={`profile-inline${multiline ? ' profile-inline--multi' : ''}${className ? ` ${className}` : ''}`}>
      {label ? <span className="profile-inline-label">{label}</span> : null}
      <div className="profile-inline-line">
        {editing ? (
          editor
        ) : (
          <button
            type="button"
            className="profile-inline-display"
            title={title}
            aria-label={label ? `Modifier ${label}` : 'Modifier'}
            onClick={() => setEditing(true)}
          >
            <span className={empty ? 'profile-inline-placeholder' : 'profile-inline-value'}>
              {empty ? placeholder : shown}
            </span>
            <HiPencil aria-hidden className="profile-inline-pencil" />
          </button>
        )}
        {editing ? <HiPencil aria-hidden className="profile-inline-pencil" /> : null}
      </div>
    </div>
  );
}
