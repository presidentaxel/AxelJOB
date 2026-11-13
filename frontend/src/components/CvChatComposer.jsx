import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { analyticsAttrs } from '../lib/analyticsAttrs.js';

/**
 * Saisie de l'offre. L'état reste ici pour ne pas reconstruire
 * l'aperçu CV (canvas Beta) à chaque touche.
 */
const CvChatComposer = forwardRef(function CvChatComposer({
  storageKey = null,
  restoreDraft = false,
  persistDraft = true,
  disabled = false,
  placeholder = '',
  sendBlocked = false,
  onSend,
}, ref) {
  const inputRef = useRef(null);
  const [value, setValue] = useState('');

  const resize = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    if (!el.value.trim()) {
      el.style.removeProperty('height');
      return;
    }
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  };

  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current?.focus();
    },
    clear() {
      setValue('');
      if (storageKey) {
        try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      }
      requestAnimationFrame(() => resize(inputRef.current));
    },
  }), [storageKey]);

  useEffect(() => {
    if (!restoreDraft || !storageKey) return undefined;
    try {
      const draft = (localStorage.getItem(storageKey) || '').trim();
      if (draft) {
        setValue((current) => current || draft);
        requestAnimationFrame(() => resize(inputRef.current));
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }, [restoreDraft, storageKey]);

  const persist = (next) => {
    if (!storageKey) return;
    try {
      const trimmed = next.trim();
      if (!trimmed) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, next);
    } catch {
      /* ignore */
    }
  };

  const submit = () => {
    const text = value.trim();
    if (!text || disabled || sendBlocked) return;
    setValue('');
    if (storageKey) {
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
    requestAnimationFrame(() => resize(inputRef.current));
    onSend(text);
  };

  return (
    <>
      <textarea
        ref={inputRef}
        className="cv-chat-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          if (persistDraft) persist(next);
          resize(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        disabled={disabled}
        {...analyticsAttrs('cv-chat-input-offer', 'chat', 'tertiary', 'input')}
      />
      <button
        type="button"
        className="cv-chat-input-send"
        onClick={submit}
        disabled={disabled || sendBlocked || !value.trim()}
        aria-label="Envoyer"
        {...analyticsAttrs('cv-chat-cta-send', 'chat', 'primary', 'cta')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
      </button>
    </>
  );
});

export default CvChatComposer;
