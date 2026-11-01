import { useEffect, useRef } from 'react';
import { HiPencil } from 'react-icons/hi2';

function fitLine(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Même ligne soulignée au repos et en saisie. Le crayon place le curseur dans ce champ.
 */
export default function InlineEdit({
  label,
  value,
  onChange,
  placeholder = 'Ajouter',
  type = 'text',
  multiline = false,
  title,
  className = '',
}) {
  const inputRef = useRef(null);
  const shown = (value ?? '').toString();

  useEffect(() => {
    fitLine(inputRef.current);
  }, [shown, multiline]);
  const focus = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const len = el.value?.length ?? 0;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* certains types (email) n’exposent pas la sélection */
    }
  };

  const shared = {
    ref: inputRef,
    className: 'profile-inline-input',
    value: shown,
    placeholder,
    'aria-label': label || placeholder,
    title,
    onChange: (e) => {
      onChange(e.target.value);
      fitLine(e.target);
    },
  };

  return (
    <div className={`profile-inline${multiline ? ' profile-inline--multi' : ''}${className ? ` ${className}` : ''}`}>
      {label ? <span className="profile-inline-label">{label}</span> : null}
      <div className="profile-inline-line">
        {multiline ? (
          <textarea {...shared} rows={1} onFocus={(e) => fitLine(e.target)} />
        ) : (
          <input {...shared} type={type} />
        )}
        <button
          type="button"
          className="profile-inline-pencil-btn"
          aria-label={label ? `Modifier ${label}` : 'Modifier'}
          title={title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={focus}
        >
          <HiPencil aria-hidden className="profile-inline-pencil" />
        </button>
      </div>
    </div>
  );
}
