import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import {
  apiGet,
  apiPut,
  apiPost,
  apiPostFile,
  apiPostBlob,
  apiUrl,
  getDownloadPermissionHint,
  prepareAppleDownloadWindow,
  saveBlobWithPreferredMethod,
  trackEvent,
} from '../api';
import { CV_IMPORT_REQUEST_TIMEOUT_MS } from '../lib/fetchWithDeadline.js';
import { supabase } from '../lib/supabase';
import { defaultCv, newExpId, newFormId, newCertId, newProjId } from '../data/cvDefault';
import TemplatePicker from './TemplatePicker';
import ReauthModal from './ReauthModal';
import DesignModeBridgeModal from './editor/DesignModeBridgeModal.jsx';
import { applyA4PageFramesToDocument, bindProfilePreviewScale, syncCvPreviewIframeHeight } from '../lib/cvPreviewA4Pages';
import { buildBetaToStableOffer } from '../lib/designModeBridge.js';
import { betaCanvasRenderFields } from '../lib/betaCanvasTemplate.js';
import { HiArrowDownTray, HiChevronDown, HiChevronUp } from 'react-icons/hi2';
import { analyticsAttrs } from '../lib/analyticsAttrs.js';
import { applyImportedProfileCv, cvFromImportPayload, extractImportApiResponse } from '../lib/cvImportUtils.js';
import {
  buildProfileCvPutPayload,
  decideProfileAutoSaveOnActiveChange,
  decideProfileAutoSaveOnCvChange,
  decideProfileAutoSaveOnLifecycle,
  decideProfileFlushStart,
  decideProfileReplayKeepalive,
  decideProfileSaveFinish,
  decideProfileSaveStart,
  nextKeepalivePending,
  profileHasUnloadGuard,
  profilePutShouldKeepalive,
} from '../lib/profileAutoSaveGate.js';
import Button from './ui/Button.jsx';
import InlineEdit from './profile/InlineEdit.jsx';
import '../styles/ProfileView.css';
import '../styles/TemplatePicker.css';
import '../styles/DesignModeBridgeModal.css';

/** Retourne un Blob JPEG recadré à partir de l’image et de la zone en pixels (pour react-easy-crop). */
function getCroppedImg(imageSrc, pixelCrop) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas non disponible'));
          return;
        }
        ctx.drawImage(
          image,
          pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
          0, 0, pixelCrop.width, pixelCrop.height
        );
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Échec de l’export'));
        }, 'image/jpeg', 0.9);
      } catch (e) {
        reject(e);
      }
    });
    image.addEventListener('error', () => reject(new Error('Image non chargée')));
    if (imageSrc.startsWith('http')) image.setAttribute('crossOrigin', 'anonymous');
    image.src = imageSrc;
  });
}

const LINKEDIN_SYNC_KEY = 'linkedin_sync_pending';
const LINKEDIN_PHOTO_KEY = 'linkedin_photo_pending';

const AUTO_SAVE_DELAY_MS = 1500;
const LIVE_PREVIEW_DEBOUNCE_MS = 600;

function ProfileCompletion({ cv }) {
  const checks = [
    { label: 'Prénom & nom', ok: !!(cv.prenom?.trim() && cv.nom?.trim()) },
    { label: 'Titre professionnel', ok: !!cv.titre_professionnel?.trim() },
    { label: 'Email', ok: !!cv.email?.trim() },
    { label: 'Au moins 1 expérience', ok: (cv.experiences || []).some(e => e.poste?.trim()) },
    { label: 'Au moins 1 formation', ok: (cv.formations || []).some(f => f.diplome?.trim()) },
    { label: 'Compétences', ok: (cv.competences?.techniques || []).some(c => typeof c === 'string' && c.trim()) },
  ];
  const done = checks.filter(c => c.ok).length;
  const pct = Math.round((done / checks.length) * 100);
  return (
    <div className="profile-completion">
      <div className="profile-completion-bar">
        <div className="profile-completion-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="profile-completion-text">Profil complet à {pct}%</span>
      <div className="profile-completion-checks">
        {checks.map(c => (
          <span key={c.label} className={`profile-check ${c.ok ? 'profile-check--done' : ''}`}>
            {c.ok ? (
              <svg className="profile-check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg className="profile-check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>
            )} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function displayedBullets(list) {
  if (Array.isArray(list) && list.length > 0) return list;
  return ['', ''];
}

function moveListItem(list, index, direction) {
  const items = list || [];
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function OrderButtons({ index, total, onMove, label }) {
  return (
    <>
      <button type="button" className="profile-card-move" disabled={index === 0} aria-label={`Monter ${label}`} title="Monter" onClick={() => onMove(index, -1)}>
        <HiChevronUp aria-hidden />
      </button>
      <button type="button" className="profile-card-move" disabled={index >= total - 1} aria-label={`Descendre ${label}`} title="Descendre" onClick={() => onMove(index, 1)}>
        <HiChevronDown aria-hidden />
      </button>
    </>
  );
}

function isSupabaseSignedPhotoUrl(url) {
  return typeof url === 'string' && url.includes('supabase.co/storage') && url.includes('/object/sign');
}

/** Aperçu texte (import / sync) : ne pas exposer l’URL de la photo. */
function formatScalarPreviewForPrivacy(fieldKey, value, maxLen) {
  if (fieldKey === 'photo_url') {
    const v = String(value ?? '').trim();
    return v ? '(photo)' : '-';
  }
  const s = (value ?? '').toString();
  return s.slice(0, maxLen) + (s.length > maxLen ? '…' : '');
}

export default function ProfileView({ isActive = true, onSaveSuccess, session, refreshKey, usage, onUpgradeClick, onUsageRefresh, onBillingPortalClick, templatesList, templateId: templateIdProp, templateOptions: templateOptionsProp, onTemplateIdChange, onTemplateOptionsChange, onPhotoSessionExpired }) {
  const [cv, setCv] = useState(defaultCv());
  const [localTemplateId, setLocalTemplateId] = useState(() => localStorage.getItem('cv_template_id') || 'minimal');
  const [localTemplateOptions, setLocalTemplateOptions] = useState(() => {
    try {
      const stored = localStorage.getItem('cv_template_options');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const templateId = templateIdProp ?? localTemplateId;
  const setTemplateId = onTemplateIdChange ?? ((id) => { setLocalTemplateId(id); localStorage.setItem('cv_template_id', id); });
  const templateOptions = templateOptionsProp ?? localTemplateOptions;
  const setTemplateOptions = onTemplateOptionsChange ?? ((opts) => { setLocalTemplateOptions(opts); localStorage.setItem('cv_template_options', JSON.stringify(opts)); });
  const [profileSection, setProfileSection] = useState('identite');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [linkedinModalOpen, setLinkedinModalOpen] = useState(false);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinApplyLoading, setLinkedinApplyLoading] = useState(false);
  const [linkedinError, setLinkedinError] = useState('');
  const [proposedChanges, setProposedChanges] = useState([]);
  const [selectedChangeIds, setSelectedChangeIds] = useState(new Set());
  const [importPhotoLoading, setImportPhotoLoading] = useState(false);
  const [uploadPhotoLoading, setUploadPhotoLoading] = useState(false);
  const [profilePreviewHtml, setProfilePreviewHtml] = useState('');
  const [profilePreviewLoading, setProfilePreviewLoading] = useState(false);
  const [baseCvPdfLoading, setBaseCvPdfLoading] = useState(false);
  const profilePreviewIframeRef = useRef(null);
  const profilePreviewScrollRef = useRef(null);
  const profilePreviewHtmlRef = useRef('');
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStepIndex, setImportStepIndex] = useState(0);
  const [importSummary, setImportSummary] = useState(null);
  const importStepTimerRef = useRef(null);
  const importFinalisationTimerRef = useRef(null);
  const [cancelSubModalOpen, setCancelSubModalOpen] = useState(false);
  const [cancelSubLoading, setCancelSubLoading] = useState(false);
  const [designBridgeOffer, setDesignBridgeOffer] = useState(null);
  const [designBridgeConfirming, setDesignBridgeConfirming] = useState(false);
  const fileInputRef = useRef(null);
  const importFileRef = useRef(null);
  const skipNextAutoSaveRef = useRef(true);
  const onSaveSuccessRef = useRef(onSaveSuccess);
  const saveToApiRef = useRef(null);
  const pendingAutoSaveRef = useRef(false);
  const savingAutoSaveRef = useRef(false);
  const pendingKeepaliveRef = useRef(false);
  const autoSaveTimerRef = useRef(null);
  const isActiveRef = useRef(isActive);
  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    onSaveSuccessRef.current = onSaveSuccess;
  }, [onSaveSuccess]);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Données profil : exclusivement depuis Supabase (liées au compte connecté via JWT)
  useEffect(() => {
    if (!session) return;
    setLoading(true);
    skipNextAutoSaveRef.current = true;
    apiGet('/api/cv?profile=1')
      .then((data) => {
        skipNextAutoSaveRef.current = true;
        const merged = { ...defaultCv(), ...data };
        setCv(merged);
        if (data?.template_id != null && onTemplateIdChange) onTemplateIdChange(data.template_id);
        if (data?.template_options != null && typeof data.template_options === 'object' && onTemplateOptionsChange) onTemplateOptionsChange(data.template_options);
        const currentTid = data?.template_id != null
          ? data.template_id
          : (templateIdProp ?? localTemplateId);
        setDesignBridgeOffer(buildBetaToStableOffer(data?.layout, currentTid));
      })
      .catch(() => {
        setCv(defaultCv());
        setDesignBridgeOffer(null);
      })
      .finally(() => setLoading(false));
  }, [session?.user?.id, refreshKey]);

  useLayoutEffect(() => {
    if (loading) return undefined;
    return bindProfilePreviewScale(profilePreviewScrollRef.current);
  }, [loading]);

  // Auto-trigger LinkedIn sync/photo after OAuth redirect
  const linkedinAutoTriggeredRef = useRef(false);

  // Hauteur = document complet : scroll sur .profile-preview-pane-scroll (pas de barre dans l’iframe).
  // Recalcul après chaque passe A4 (ResizeObserver dans applyA4PageFramesToDocument), sinon 2e page coupée.
  const resizeProfilePreviewIframe = useCallback((iframe) => {
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc?.documentElement) return;
      applyA4PageFramesToDocument(doc, {
        onLayout: () => syncCvPreviewIframeHeight(iframe),
      });
      syncCvPreviewIframeHeight(iframe);
    } catch (_) { /* ignore */ }
  }, []);

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current == null) return;
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
  }, []);

  const flushPendingAutoSave = useCallback((opts = {}) => {
    const action = decideProfileFlushStart({
      hasPending: pendingAutoSaveRef.current,
      saving: savingAutoSaveRef.current,
    });
    if (action === 'defer') {
      pendingAutoSaveRef.current = true;
      pendingKeepaliveRef.current = nextKeepalivePending({
        already: pendingKeepaliveRef.current,
        keepalive: opts.keepalive,
      });
      clearAutoSaveTimer();
      return;
    }
    if (action !== 'start') return;
    pendingAutoSaveRef.current = false;
    clearAutoSaveTimer();
    void saveToApiRef.current?.({ silent: true, keepalive: Boolean(opts.keepalive) });
  }, [clearAutoSaveTimer]);

  // Auto-save : sauvegarde automatique après modification (debounce)
  const saveToApi = useCallback(async ({ silent = false, keepalive = false } = {}) => {
    if (decideProfileSaveStart({ saving: savingAutoSaveRef.current }) === 'defer') {
      pendingAutoSaveRef.current = true;
      pendingKeepaliveRef.current = nextKeepalivePending({
        already: pendingKeepaliveRef.current,
        keepalive,
      });
      return;
    }
    const payload = buildProfileCvPutPayload(cv, templateId, templateOptions);
    pendingAutoSaveRef.current = false;
    savingAutoSaveRef.current = true;
    setError('');
    setSaving(true);
    try {
      await apiPut('/api/cv', payload, {
        keepalive: keepalive && profilePutShouldKeepalive(payload),
      });
      if (!silent) {
        setMessage('Sauvegardé');
        setTimeout(() => setMessage(''), 2000);
      }
      onSaveSuccessRef.current?.();
    } catch (e) {
      setError(e.message || 'Erreur lors de l’enregistrement.');
    } finally {
      savingAutoSaveRef.current = false;
      setSaving(false);
      if (decideProfileSaveFinish({ hasPending: pendingAutoSaveRef.current }) === 'replay') {
        const keepaliveReplay = decideProfileReplayKeepalive({
          keepalivePending: pendingKeepaliveRef.current,
        });
        pendingKeepaliveRef.current = false;
        void saveToApiRef.current?.({ silent: true, keepalive: keepaliveReplay });
      }
    }
  }, [cv, templateId, templateOptions]);
  useEffect(() => {
    saveToApiRef.current = saveToApi;
  }, [saveToApi]);

  const handleConfirmDesignBridge = useCallback(async (offer) => {
    if (!offer?.templateId) {
      setDesignBridgeOffer(null);
      return;
    }
    setDesignBridgeConfirming(true);
    setError('');
    try {
      const templateChanged = offer.templateId !== templateId;
      const nextOptions = templateChanged ? {} : (templateOptions || {});
      // Persister d’abord — ne mettre à jour l’UI locale qu’après succès API.
      await apiPut('/api/cv', buildProfileCvPutPayload(cv, offer.templateId, nextOptions));
      if (onTemplateIdChange) onTemplateIdChange(offer.templateId);
      else setLocalTemplateId(offer.templateId);
      if (templateChanged) {
        if (onTemplateOptionsChange) onTemplateOptionsChange({});
        else setLocalTemplateOptions({});
      }
      setMessage(
        templateChanged
          ? `Template Stable « ${offer.templateLabel || offer.templateId} » appliqué`
          : 'Préférences Stable conservées',
      );
      setTimeout(() => setMessage(''), 2500);
      setDesignBridgeOffer(null);
      onSaveSuccess?.();
    } catch (e) {
      setError(e.message || 'Impossible d’appliquer le template Stable.');
    } finally {
      setDesignBridgeConfirming(false);
    }
  }, [cv, templateId, templateOptions, onTemplateIdChange, onTemplateOptionsChange, onSaveSuccess]);

  const handleDismissDesignBridge = useCallback(() => {
    setDesignBridgeOffer(null);
  }, []);

  const fetchLinkedInWithToken = useCallback(async (token) => {
    setLinkedinError('');
    setLinkedinLoading(true);
    setProposedChanges([]);
    setLinkedinModalOpen(true);
    try {
      const data = await apiPost('/api/cv/fetch-linkedin', { linkedin_access_token: token });
      setProposedChanges(data.proposed_changes || []);
      setSelectedChangeIds(new Set((data.proposed_changes || []).map((c) => c.id)));
      if (!(data.proposed_changes || []).length) {
        setLinkedinError('Aucune diff\u00e9rence entre ton CV et ton profil LinkedIn.');
      }
    } catch (e) {
      const msg = e.message || '';
      const isTokenError = msg.includes('invalide') || msg.includes('expir') || e.status === 400;
      if (isTokenError) {
        setLinkedinModalOpen(false);
        setLinkedinLoading(false);
        throw e;
      }
      setLinkedinError(msg || 'Impossible de r\u00e9cup\u00e9rer le profil LinkedIn.');
      setProposedChanges([]);
    } finally {
      setLinkedinLoading(false);
    }
  }, []);

  const handleImportLinkedInPhotoWithToken = useCallback(async (token) => {
    setError('');
    setMessage('');
    setImportPhotoLoading(true);
    try {
      await apiPost('/api/cv/import-linkedin-photo', { linkedin_access_token: token });
      const fresh = await apiGet('/api/cv');
      setCv({ ...defaultCv(), ...fresh });
      setMessage('Photo LinkedIn import\u00e9e et enregistr\u00e9e.');
      onSaveSuccess?.();
    } catch (e) {
      setError(e.message || 'Impossible d\'importer la photo LinkedIn.');
    } finally {
      setImportPhotoLoading(false);
    }
  }, [onSaveSuccess]);

  useEffect(() => {
    if (!session?.provider_token || loading || linkedinAutoTriggeredRef.current) return;
    const syncPending = localStorage.getItem(LINKEDIN_SYNC_KEY);
    const photoPending = localStorage.getItem(LINKEDIN_PHOTO_KEY);
    if (syncPending || photoPending) {
      linkedinAutoTriggeredRef.current = true;
      if (syncPending) {
        localStorage.removeItem(LINKEDIN_SYNC_KEY);
        fetchLinkedInWithToken(session.provider_token);
      }
      if (photoPending) {
        localStorage.removeItem(LINKEDIN_PHOTO_KEY);
        handleImportLinkedInPhotoWithToken(session.provider_token);
      }
    }
  }, [session?.provider_token, loading, fetchLinkedInWithToken, handleImportLinkedInPhotoWithToken]);

  useEffect(() => {
    const action = decideProfileAutoSaveOnCvChange({
      loading,
      skipNext: skipNextAutoSaveRef.current,
      isActive: isActiveRef.current,
    });
    if (action === 'wait') return undefined;
    if (action === 'skip') {
      skipNextAutoSaveRef.current = false;
      pendingAutoSaveRef.current = false;
      clearAutoSaveTimer();
      return undefined;
    }
    if (action === 'ignore') return undefined;
    pendingAutoSaveRef.current = true;
    clearAutoSaveTimer();
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void saveToApiRef.current?.({ silent: !isActiveRef.current });
    }, AUTO_SAVE_DELAY_MS);
    return () => clearAutoSaveTimer();
  }, [cv, loading, clearAutoSaveTimer]);

  // AXE-29 / Bugbot : flush le debounce si on quitte Profil (le panel reste monté).
  // Ne pas replanifier un PUT rien qu’en redevenant actif.
  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (decideProfileAutoSaveOnActiveChange({
      wasActive,
      isActive,
      hasPending: pendingAutoSaveRef.current,
    }) === 'flush') {
      flushPendingAutoSave();
    }
  }, [isActive, flushPendingAutoSave]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPageHide = () => {
      if (decideProfileAutoSaveOnLifecycle({
        event: 'pagehide',
        hasPending: pendingAutoSaveRef.current,
      }) === 'flush') {
        flushPendingAutoSave({ keepalive: true });
      }
    };
    const onVisibility = () => {
      if (decideProfileAutoSaveOnLifecycle({
        event: 'visibility',
        hasPending: pendingAutoSaveRef.current,
        visibilityState: document.visibilityState,
      }) === 'flush') {
        flushPendingAutoSave({ keepalive: true });
      }
    };
    const onBeforeUnload = (event) => {
      if (!profileHasUnloadGuard({
        hasPending: pendingAutoSaveRef.current,
        saving: savingAutoSaveRef.current,
      })) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      if (decideProfileAutoSaveOnLifecycle({
        event: 'unmount',
        hasPending: pendingAutoSaveRef.current,
      }) === 'flush') {
        flushPendingAutoSave({ keepalive: true });
      }
    };
  }, [flushPendingAutoSave]);

  useEffect(() => {
    if (onTemplateIdChange) return;
    localStorage.setItem('cv_template_id', templateId);
  }, [templateId, onTemplateIdChange]);
  useEffect(() => {
    if (onTemplateOptionsChange) return;
    localStorage.setItem('cv_template_options', JSON.stringify(templateOptions));
  }, [templateOptions, onTemplateOptionsChange]);

  // Aperçu = même HTML que le rendu navigateur (render-html), pas le PDF, pour éviter les soucis WeasyPrint sur le profil
  const templateKey = templateId + '|' + JSON.stringify(templateOptions);
  useEffect(() => {
    profilePreviewHtmlRef.current = profilePreviewHtml;
  }, [profilePreviewHtml]);
  useEffect(() => {
    if (loading) return undefined;
    if (!isActive) {
      setProfilePreviewLoading(false);
      return undefined;
    }
    let cancelled = false;
    const keepExistingPreview = Boolean(profilePreviewHtmlRef.current);
    if (!keepExistingPreview) setProfilePreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const html = await apiPost('/api/render-html', {
          cv,
          template_id: templateId,
          template_options: templateOptions,
          ...betaCanvasRenderFields(templateId, cv?.layout),
        });
        if (cancelled) return;
        setProfilePreviewHtml(typeof html === 'string' ? html : '');
      } catch {
        if (!cancelled && !profilePreviewHtmlRef.current) setProfilePreviewHtml('');
      } finally {
        if (!cancelled) setProfilePreviewLoading(false);
      }
    }, LIVE_PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cv, loading, templateKey, isActive]);

  const downloadBaseCvPdf = useCallback(async () => {
    if (loading) return;
    setBaseCvPdfLoading(true);
    setError('');
    const preopenedWindow = prepareAppleDownloadWindow();
    try {
      const pdfTemplateOptions = { ...templateOptions, show_mots_cles_ats: templateOptions?.show_mots_cles_ats !== false };
      const { blob, filename } = await apiPostBlob('/api/pdf', {
        cv,
        template_id: templateId,
        template_options: pdfTemplateOptions,
        ...betaCanvasRenderFields(templateId, cv?.layout),
      });
      await saveBlobWithPreferredMethod(blob, filename || 'CV-base.pdf', { preopenedWindow });
      trackEvent('base_cv_pdf_downloaded', { template_id: templateId, source: 'profile' });
    } catch (e) {
      if (preopenedWindow && !preopenedWindow.closed) preopenedWindow.close();
      setError(`Téléchargement PDF : ${e.message || e}${getDownloadPermissionHint()}`);
    } finally {
      setBaseCvPdfLoading(false);
    }
  }, [loading, cv, templateId, templateOptions]);

  // Template / HTML : réappliquer cadres A4 (onLoad parfois insuffisant après changement de srcDoc)
  useEffect(() => {
    if (!profilePreviewHtml) return;
    const iframe = profilePreviewIframeRef.current;
    if (!iframe) return;
    const run = () => {
      try {
        if (!iframe.contentDocument?.body) return;
        resizeProfilePreviewIframe(iframe);
      } catch (_) { /* ignore */ }
    };
    const t0 = window.setTimeout(run, 0);
    const t1 = window.setTimeout(run, 120);
    const t2 = window.setTimeout(run, 380);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [profilePreviewHtml, templateKey, resizeProfilePreviewIframe]);

  const update = (path, value) => {
    if (path.includes('.')) {
      const [key, ...rest] = path.split('.');
      setCv((prev) => ({
        ...prev,
        [key]: rest.length === 1 ? value : { ...prev[key], [rest.join('.')]: value },
      }));
      return;
    }
    setCv((prev) => ({ ...prev, [path]: value }));
  };

  const updateExp = (index, field, value) => {
    setCv((prev) => {
      const next = [...(prev.experiences || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, experiences: next };
    });
  };

  const addExp = () => {
    setCv((prev) => ({
      ...prev,
      experiences: [
        { id: newExpId(), poste: '', entreprise: '', secteur: '', date_debut: '', date_fin: '', lieu: '', contexte: '', bullet_points: ['', ''], mots_cles: [], clients: '' },
        ...(prev.experiences || []),
      ],
    }));
  };

  const removeExp = (index) => {
    setCv((prev) => ({
      ...prev,
      experiences: prev.experiences.filter((_, i) => i !== index),
    }));
  };

  const moveExp = (index, direction) => {
    setCv((prev) => ({ ...prev, experiences: moveListItem(prev.experiences, index, direction) }));
  };

  const updateExpBullet = (expIndex, bulletIndex, value) => {
    setCv((prev) => {
      const next = [...(prev.experiences || [])];
      const bullets = [...displayedBullets(next[expIndex].bullet_points)];
      bullets[bulletIndex] = value;
      next[expIndex] = { ...next[expIndex], bullet_points: bullets };
      return { ...prev, experiences: next };
    });
  };

  const addExpBullet = (expIndex) => {
    setCv((prev) => {
      const next = [...(prev.experiences || [])];
      const bullets = [...displayedBullets(next[expIndex].bullet_points)];
      bullets.push('');
      next[expIndex] = { ...next[expIndex], bullet_points: bullets };
      return { ...prev, experiences: next };
    });
  };

  const moveExpBullet = (expIndex, bulletIndex, direction) => {
    setCv((prev) => {
      const next = [...(prev.experiences || [])];
      const bullets = moveListItem(displayedBullets(next[expIndex].bullet_points), bulletIndex, direction);
      next[expIndex] = { ...next[expIndex], bullet_points: bullets };
      return { ...prev, experiences: next };
    });
  };

  const removeExpBullet = (expIndex, bulletIndex) => {
    setCv((prev) => {
      const next = [...(prev.experiences || [])];
      const bullets = displayedBullets(next[expIndex].bullet_points).filter((_, j) => j !== bulletIndex);
      if (bullets.length === 0) bullets.push('');
      next[expIndex] = { ...next[expIndex], bullet_points: bullets };
      return { ...prev, experiences: next };
    });
  };

  const addFormation = () => {
    setCv((prev) => ({
      ...prev,
      formations: [{ id: newFormId(), diplome: '', etablissement: '', date: '', mention: '' }, ...(prev.formations || [])],
    }));
  };

  const removeFormation = (index) => {
    setCv((prev) => ({ ...prev, formations: prev.formations.filter((_, i) => i !== index) }));
  };

  const moveFormation = (index, direction) => {
    setCv((prev) => ({ ...prev, formations: moveListItem(prev.formations, index, direction) }));
  };

  const updateFormation = (index, field, value) => {
    setCv((prev) => {
      const next = [...(prev.formations || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, formations: next };
    });
  };

  const addCertification = () => {
    setCv((prev) => ({
      ...prev,
      certifications: [{ id: newCertId(), nom: '', organisme: '', date: '' }, ...(prev.certifications || [])],
    }));
  };

  const removeCertification = (index) => {
    setCv((prev) => ({ ...prev, certifications: (prev.certifications || []).filter((_, i) => i !== index) }));
  };

  const moveCertification = (index, direction) => {
    setCv((prev) => ({ ...prev, certifications: moveListItem(prev.certifications, index, direction) }));
  };

  const updateCertification = (index, field, value) => {
    setCv((prev) => {
      const next = [...(prev.certifications || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, certifications: next };
    });
  };

  const addProjet = () => {
    setCv((prev) => ({
      ...prev,
      projets: [{ id: newProjId(), nom: '', description: '', mots_cles: [] }, ...(prev.projets || [])],
    }));
  };

  const removeProjet = (index) => {
    setCv((prev) => ({ ...prev, projets: prev.projets.filter((_, i) => i !== index) }));
  };

  const moveProjet = (index, direction) => {
    setCv((prev) => ({ ...prev, projets: moveListItem(prev.projets, index, direction) }));
  };

  const updateProjet = (index, field, value) => {
    setCv((prev) => {
      const next = [...(prev.projets || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, projets: next };
    });
  };

  const comp = cv.competences || { techniques: [], logiciels: [], langues: [], autres: [] };
  const updateCompList = (key, index, value) => setCv((prev) => {
    const arr = [...(prev.competences?.[key] || [])];
    const current = arr[index];
    arr[index] = typeof current === 'object' && current !== null ? { ...current, ...value } : value;
    return { ...prev, competences: { ...(prev.competences || {}), [key]: arr } };
  });
  const addCompList = (key, emptyItem) => setCv((prev) => {
    const arr = [...(prev.competences?.[key] || []), emptyItem];
    return { ...prev, competences: { ...(prev.competences || {}), [key]: arr } };
  });
  const removeCompList = (key, index) => setCv((prev) => {
    const arr = (prev.competences?.[key] || []).filter((_, i) => i !== index);
    return { ...prev, competences: { ...(prev.competences || {}), [key]: arr } };
  });

  const handleSave = async () => {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await apiPut('/api/cv', buildProfileCvPutPayload(cv, templateId, templateOptions));
      setMessage('CV enregistré.');
      onSaveSuccess?.();
    } catch (e) {
      setError(e.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  const initiateLinkedInOAuth = async (pendingKey) => {
    if (!supabase) return;
    localStorage.setItem(pendingKey, '1');
    const redirectTo = window.location.origin + '/login?next=/app/profil';
    const { error: linkErr } = await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: { redirectTo },
    });
    if (linkErr) {
      localStorage.removeItem(pendingKey);
      setLinkedinError(linkErr.message || 'Erreur de connexion LinkedIn.');
      setLinkedinModalOpen(true);
    }
  };

  const toggleChangeSelection = (id) => {
    setSelectedChangeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const openCropModal = (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choisis un fichier image (JPEG, PNG, WebP ou GIF).');
      return;
    }
    setError('');
    setCropImageSrc(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropModalOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const closeCropModal = useCallback(() => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropModalOpen(false);
    setCropImageSrc(null);
    setCroppedAreaPixels(null);
  }, [cropImageSrc]);

  const handleConfirmCrop = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    setUploadPhotoLoading(true);
    setError('');
    try {
      const blob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      const data = await apiPostFile('/api/cv/upload-photo', file);
      const photoUrl = (data.photo_url || '').trim();
      if (photoUrl) update('photo_url', photoUrl);
      setMessage('Photo importée (sauvegarde automatique).');
      onSaveSuccess?.();
      closeCropModal();
      setPhotoModalOpen(false);
    } catch (err) {
      setError(err.message || 'Impossible d\'importer la photo.');
    } finally {
      setUploadPhotoLoading(false);
    }
  };

  const handleImportLinkedInPhoto = async () => {
    const token = session?.provider_token;
    if (!token) {
      await initiateLinkedInOAuth(LINKEDIN_PHOTO_KEY);
      return;
    }
    try {
      await handleImportLinkedInPhotoWithToken(token);
    } catch {
      await initiateLinkedInOAuth(LINKEDIN_PHOTO_KEY);
    }
  };

  const handleApplyLinkedInChanges = async () => {
    const toApply = proposedChanges.filter((c) => selectedChangeIds.has(c.id));
    if (!toApply.length) return;
    setLinkedinApplyLoading(true);
    setLinkedinError('');
    try {
      await apiPost('/api/cv/apply-linkedin-updates', {
        changes: toApply.map((c) => ({ field: c.field, linkedin_value: c.linkedin_value })),
      });
      const data = await apiGet('/api/cv');
      setCv({ ...defaultCv(), ...data });
      setLinkedinModalOpen(false);
      setMessage('CV mis à jour depuis LinkedIn.');
      onSaveSuccess?.();
    } catch (e) {
      setLinkedinError(e.message || 'Erreur lors de l\'application des changements.');
    } finally {
      setLinkedinApplyLoading(false);
    }
  };

  const IMPORT_STEPS = [
    'Lecture du document',
    'Extraction du texte',
    'Identification des sections',
    'Analyse des expériences et formations',
    'Structuration des données',
    'Finalisation',
  ];
  const IMPORT_STEP_DURATION_MS = 1400;
  const IMPORT_PHASE_DURATION_MS = 7000;

  const handleImportCv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportStepIndex(0);
    setError('');
    if (importStepTimerRef.current) clearInterval(importStepTimerRef.current);
    if (importFinalisationTimerRef.current) clearTimeout(importFinalisationTimerRef.current);
    importStepTimerRef.current = setInterval(() => {
      setImportStepIndex((i) => {
        if (i >= 4) {
          if (importStepTimerRef.current) clearInterval(importStepTimerRef.current);
          return 5;
        }
        return i + 1;
      });
    }, IMPORT_STEP_DURATION_MS);
    importFinalisationTimerRef.current = setTimeout(() => {
      setImportStepIndex(5);
      if (importStepTimerRef.current) clearInterval(importStepTimerRef.current);
    }, IMPORT_PHASE_DURATION_MS);
    try {
      const result = await apiPostFile('/api/cv/import', file, 'file', { timeoutMs: CV_IMPORT_REQUEST_TIMEOUT_MS });
      const imported = cvFromImportPayload(extractImportApiResponse(result).cv);
      const next = applyImportedProfileCv(cv, imported);
      skipNextAutoSaveRef.current = true;
      setCv(next);
      setProfileSection('identite');
      setSaving(true);
      try {
        await apiPut('/api/cv', buildProfileCvPutPayload(next, templateId, templateOptions));
        const nExp = (imported.experiences || []).filter((item) => item?.poste || item?.entreprise).length;
        const nForm = (imported.formations || []).filter((item) => item?.diplome || item?.etablissement).length;
        setImportSummary({
          name: [imported.prenom, imported.nom].filter(Boolean).join(' '),
          title: imported.titre_professionnel || '',
          experiences: nExp,
          formations: nForm,
        });
        onSaveSuccess?.();
      } catch (saveErr) {
        setError(saveErr.message || 'CV importé à l’écran, mais l’enregistrement a échoué.');
      } finally {
        setSaving(false);
      }
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'import.');
    } finally {
      setImportLoading(false);
      if (importStepTimerRef.current) clearInterval(importStepTimerRef.current);
      if (importFinalisationTimerRef.current) clearTimeout(importFinalisationTimerRef.current);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  if (loading) return <div className="profile-loading">Chargement du profil…</div>;

  return (
    <div className="profile-view profile-view-with-preview">
      <div className="profile-form-pane">
      <div className="profile-header">
        <h1 className="ds-label-md">Profil</h1>
        <div className="profile-header-actions">
          <input ref={importFileRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: 'none' }} onChange={handleImportCv} />
          <Button type="button" variant="secondary" size="sm" title="Importer un CV" onClick={() => importFileRef.current?.click()} disabled={importLoading} loading={importLoading} {...analyticsAttrs('profil-header-cta-import', 'header', 'secondary', 'cta')}>
            {importLoading ? 'Import…' : 'Importer'}
          </Button>
          <Button type="button" variant="primary" size="sm" className="profile-save-btn" title="Enregistrer les modifications" onClick={handleSave} disabled={saving} loading={saving} {...analyticsAttrs('profil-header-cta-save', 'header', 'primary', 'cta')}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      {importLoading && createPortal(
        <div className="import-cv-loading-overlay import-cv-loading-overlay--front" role="status" aria-live="polite">
          <div className="import-cv-loading-card">
            <div className="import-cv-loading-spinner" aria-hidden="true" />
            <p className="import-cv-loading-title">Analyse de ton CV en cours</p>
            <ul className="import-cv-loading-steps" aria-live="polite">
              {IMPORT_STEPS.map((label, i) => (
                <li key={i} className={`import-cv-loading-step ${i < importStepIndex ? 'import-cv-loading-step--done' : i === importStepIndex ? 'import-cv-loading-step--current' : ''}`}>
                  <span className="import-cv-loading-step-icon">
                    {i < importStepIndex ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : i === importStepIndex ? (
                      <span className="import-cv-loading-step-spinner" aria-hidden="true" />
                    ) : (
                      <span className="import-cv-loading-step-dot" aria-hidden="true" />
                    )}
                  </span>
                  <span className="import-cv-loading-step-label">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body,
      )}

      {message && <div className="profile-toast profile-toast--success" role="status">{message}</div>}
      {error && <div className="profile-toast profile-toast--error" role="alert">{error}</div>}

      <ProfileCompletion cv={cv} />

      <nav className="profile-section-nav" aria-label="Rubriques du profil">
        {[
          { id: 'identite', label: 'Identité' },
          { id: 'experiences', label: 'Expériences' },
          { id: 'formations', label: 'Formations' },
          { id: 'certifications', label: 'Certifications' },
          { id: 'projets', label: 'Projets' },
          { id: 'competences', label: 'Compétences' },
          ...(usage?.plan === 'pro' && !usage?.paywall_disabled ? [{ id: 'abonnement', label: 'Abonnement' }] : []),
        ].map((section) => (
          <button
            key={section.id}
            type="button"
            aria-current={profileSection === section.id ? 'page' : undefined}
            onClick={() => setProfileSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {profileSection === 'identite' && (
      <section className="profile-section-panel">
        <h2 className="ds-label-md">Identité</h2>
        <div className="profile-photo-row profile-photo-row-simple">
          <div className="profile-photo-preview">
            {(cv.photo_url || '').trim() ? (
              <img
                src={(cv.photo_url || '').startsWith('http') ? cv.photo_url : apiUrl('/api/assets/' + (cv.photo_url || '').replace(/^assets\//, ''))}
                alt="Photo CV"
                className="profile-photo-img"
                onError={(e) => {
                  const src = e.target?.src;
                  if (isSupabaseSignedPhotoUrl(src) && onPhotoSessionExpired) {
                    onPhotoSessionExpired();
                    return;
                  }
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <span className="profile-photo-placeholder">Aucune photo</span>
            )}
          </div>
          <Button type="button" variant="tertiary" size="sm" className="profile-photo-edit-btn" onClick={() => setPhotoModalOpen(true)}>
            Modifier
          </Button>
        </div>
        {photoModalOpen && (
          <div className="profile-photo-modal-overlay" onClick={() => setPhotoModalOpen(false)} role="dialog" aria-modal="true" aria-labelledby="photo-modal-title">
            <div className="profile-photo-modal" onClick={(e) => e.stopPropagation()}>
              <h3 id="photo-modal-title">Modifier la photo</h3>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="profile-photo-file-input"
                onChange={(e) => { openCropModal(e); }}
                aria-label="Choisir une image"
              />
              <Button type="button" variant="secondary" className="profile-photo-modal-btn" onClick={() => { fileInputRef.current?.click(); }} disabled={uploadPhotoLoading} loading={uploadPhotoLoading}>
                {uploadPhotoLoading ? 'Import…' : 'Importer depuis mon PC'}
              </Button>
              <Button type="button" variant="secondary" className="btn-linkedin-sync profile-photo-modal-btn" onClick={() => { handleImportLinkedInPhoto(); setPhotoModalOpen(false); }} disabled={importPhotoLoading} loading={importPhotoLoading}>
                {importPhotoLoading ? 'Import…' : 'Importer la photo LinkedIn'}
              </Button>
              <Button type="button" variant="tertiary" className="profile-photo-modal-close" onClick={() => setPhotoModalOpen(false)}>Fermer</Button>
            </div>
          </div>
        )}
        {cropModalOpen && cropImageSrc && (
          <div className="profile-crop-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="crop-modal-title">
            <div className="profile-crop-modal" onClick={(e) => e.stopPropagation()}>
              <h3 id="crop-modal-title">Cadrer la photo pour le CV</h3>
              <p className="profile-crop-modal-hint">Déplace et zoome l’image pour choisir le cadrage (affichage en cercle sur le CV).</p>
              <div className="profile-crop-container">
                <Cropper
                  image={cropImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
              <div className="profile-crop-zoom-row">
                <span className="profile-crop-zoom-label">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="profile-crop-zoom-slider"
                  aria-label="Zoom"
                />
              </div>
              <div className="profile-crop-modal-actions">
                <Button type="button" variant="tertiary" onClick={closeCropModal}>Annuler</Button>
                <Button type="button" variant="primary" onClick={handleConfirmCrop} disabled={uploadPhotoLoading || !croppedAreaPixels} loading={uploadPhotoLoading}>
                  {uploadPhotoLoading ? 'Import…' : 'Valider le cadrage'}
                </Button>
              </div>
            </div>
          </div>
        )}
        <div className="profile-grid profile-grid-identity">
          <InlineEdit label="Prénom" value={cv.prenom || ''} onChange={(v) => update('prenom', v)} />
          <InlineEdit label="Nom" value={cv.nom || ''} onChange={(v) => update('nom', v)} />
          <InlineEdit label="Email" type="email" value={cv.email || ''} onChange={(v) => update('email', v)} />
          <InlineEdit label="Téléphone" value={cv.telephone || ''} onChange={(v) => update('telephone', v)} />
          <InlineEdit label="LinkedIn" value={cv.linkedin || ''} onChange={(v) => update('linkedin', v)} placeholder="URL" />
          <InlineEdit label="Ville" value={cv.ville || ''} onChange={(v) => update('ville', v)} />
          <InlineEdit label="Titre professionnel" value={cv.titre_professionnel || ''} onChange={(v) => update('titre_professionnel', v)} placeholder="ex. Étudiant HEC - Data Analyst ou Data Analyst" />
          <InlineEdit label="Résumé / Accroche" multiline value={cv.resume || ''} onChange={(v) => update('resume', v)} placeholder="Quelques lignes pour te présenter" />
        </div>
      </section>
      )}

      {profileSection === 'experiences' && (
      <section className="profile-section-panel">
        <h2 className="ds-label-md">Expériences</h2>
        <div className="profile-section-head">
          <button type="button" className="btn btn-add" onClick={addExp}>+ Ajouter une expérience</button>
        </div>
        {(cv.experiences || []).map((exp, i) => (
          <div key={exp.id} className="profile-card">
            <div className="profile-card-head">
              <span>{exp.poste || exp.entreprise || `Expérience ${i + 1}`}</span>
              <div className="profile-card-actions">
                <OrderButtons index={i} total={(cv.experiences || []).length} onMove={moveExp} label="cette expérience" />
                <button type="button" className="btn btn-remove" onClick={() => removeExp(i)} title="Supprimer">×</button>
              </div>
            </div>
            <div className="profile-grid">
              <InlineEdit label="Poste" value={exp.poste || ''} onChange={(v) => updateExp(i, 'poste', v)} />
              <InlineEdit label="Organisation" value={exp.entreprise || ''} onChange={(v) => updateExp(i, 'entreprise', v)} placeholder="Entreprise, association, administration…" />
              <InlineEdit label="Secteur" value={exp.secteur || ''} onChange={(v) => updateExp(i, 'secteur', v)} />
              <InlineEdit label="Date début" value={exp.date_debut || ''} onChange={(v) => updateExp(i, 'date_debut', v)} placeholder="ex. 2022, 01/2024" title="Année ou mois (vide = pas affiché sur le CV)" />
              <InlineEdit label="Date fin" value={exp.date_fin || ''} onChange={(v) => updateExp(i, 'date_fin', v)} placeholder="ex. Aujourd'hui, 08/2024" title="Année, mois ou Aujourd'hui (vide = pas affiché)" />
              <InlineEdit label="Lieu" value={exp.lieu || ''} onChange={(v) => updateExp(i, 'lieu', v)} />
            </div>
            <InlineEdit label="Contexte" value={exp.contexte || ''} onChange={(v) => updateExp(i, 'contexte', v)} />
            <div className="profile-bullets">
              <div className="profile-bullets-head">
                <span>Bullet points</span>
                <button type="button" className="btn btn-add" onClick={() => addExpBullet(i)}>+ Ajouter un point</button>
              </div>
              {displayedBullets(exp.bullet_points).map((b, j) => (
                <div key={j} className="profile-bullet-row">
                  <InlineEdit multiline value={b} onChange={(v) => updateExpBullet(i, j, v)} placeholder={`Point ${j + 1}`} />
                  <OrderButtons index={j} total={displayedBullets(exp.bullet_points).length} onMove={(idx, dir) => moveExpBullet(i, idx, dir)} label="ce point" />
                  <button type="button" className="btn btn-remove" onClick={() => removeExpBullet(i, j)} title="Supprimer ce point">×</button>
                </div>
              ))}
            </div>
            <InlineEdit label="Clients" value={exp.clients || ''} onChange={(v) => updateExp(i, 'clients', v)} placeholder="ex. L'Oréal, Charal, Herta" title="Liste de clients ou types de clients (vide = pas affiché)" />
          </div>
        ))}
      </section>
      )}

      {profileSection === 'formations' && (
      <section className="profile-section-panel">
        <h2 className="ds-label-md">Formations</h2>
        <div className="profile-section-head">
          <button type="button" className="btn btn-add" onClick={addFormation}>+ Ajouter</button>
        </div>
        {(cv.formations || []).map((form, i) => (
          <div key={form.id} className="profile-card">
            <div className="profile-card-head">
              <span>{form.diplome || form.etablissement || `Formation ${i + 1}`}</span>
              <div className="profile-card-actions">
                <OrderButtons index={i} total={(cv.formations || []).length} onMove={moveFormation} label="cette formation" />
                <button type="button" className="btn btn-remove" onClick={() => removeFormation(i)}>×</button>
              </div>
            </div>
            <div className="profile-grid">
              <InlineEdit label="Diplôme" value={form.diplome || ''} onChange={(v) => updateFormation(i, 'diplome', v)} />
              <InlineEdit label="Établissement" value={form.etablissement || ''} onChange={(v) => updateFormation(i, 'etablissement', v)} />
              <InlineEdit label="Date" value={form.date || ''} onChange={(v) => updateFormation(i, 'date', v)} placeholder="ex. 2024, 06/2023" title="Année ou mois (vide = pas affiché sur le CV)" />
              <InlineEdit label="Description" multiline value={form.mention || ''} onChange={(v) => updateFormation(i, 'mention', v)} placeholder="ex. Mention Bien, Félicitations du jury" />
            </div>
          </div>
        ))}
      </section>
      )}

      {profileSection === 'certifications' && (
      <section className="profile-section-panel">
        <h2 className="ds-label-md">Certifications</h2>
        <div className="profile-section-head">
          <button type="button" className="btn btn-add" onClick={addCertification}>+ Ajouter</button>
        </div>
        {(cv.certifications || []).map((cert, i) => (
          <div key={cert.id} className="profile-card">
            <div className="profile-card-head">
              <span>{cert.nom || `Certification ${i + 1}`}</span>
              <div className="profile-card-actions">
                <OrderButtons index={i} total={(cv.certifications || []).length} onMove={moveCertification} label="cette certification" />
                <button type="button" className="btn btn-remove" onClick={() => removeCertification(i)}>×</button>
              </div>
            </div>
            <div className="profile-grid">
              <InlineEdit label="Intitulé" value={cert.nom || ''} onChange={(v) => updateCertification(i, 'nom', v)} placeholder="ex. PMP, AWS Solutions Architect" />
              <InlineEdit label="Organisme" value={cert.organisme || ''} onChange={(v) => updateCertification(i, 'organisme', v)} placeholder="ex. PMI, Amazon" />
              <InlineEdit label="Date" value={cert.date || ''} onChange={(v) => updateCertification(i, 'date', v)} placeholder="ex. 2024, 06/2023" />
            </div>
          </div>
        ))}
      </section>
      )}

      {profileSection === 'projets' && (
      <section className="profile-section-panel">
        <h2 className="ds-label-md">Projets</h2>
        <div className="profile-section-head">
          <button type="button" className="btn btn-add" onClick={addProjet}>+ Ajouter</button>
        </div>
        {(cv.projets || []).map((proj, i) => (
          <div key={proj.id} className="profile-card">
            <div className="profile-card-head">
              <span>{proj.nom || `Projet ${i + 1}`}</span>
              <div className="profile-card-actions">
                <OrderButtons index={i} total={(cv.projets || []).length} onMove={moveProjet} label="ce projet" />
                <button type="button" className="btn btn-remove" onClick={() => removeProjet(i)}>×</button>
              </div>
            </div>
            <InlineEdit label="Nom" value={proj.nom || ''} onChange={(v) => updateProjet(i, 'nom', v)} />
            <InlineEdit label="Description" multiline value={proj.description || ''} onChange={(v) => updateProjet(i, 'description', v)} />
          </div>
        ))}
      </section>
      )}

      {profileSection === 'competences' && (
      <section className="profile-section-panel">
        <h2 className="ds-label-md">Compétences</h2>
        <div className="profile-card">
          <h3 className="sidebar-category">Compétences techniques</h3>
          {(comp.techniques || []).map((item, i) => (
            <div key={i} className="profile-comp-row">
              <InlineEdit value={typeof item === 'string' ? item : ''} onChange={(v) => updateCompList('techniques', i, v)} placeholder="ex. Python, Gestion de projet" />
              <button type="button" className="btn btn-remove" onClick={() => removeCompList('techniques', i)} title="Supprimer">×</button>
            </div>
          ))}
          <button type="button" className="btn btn-add" onClick={() => addCompList('techniques', '')}>+ Ajouter</button>
        </div>
        <div className="profile-card">
          <h3 className="sidebar-category">Logiciels & outils</h3>
          {(comp.logiciels || []).map((item, i) => (
            <div key={i} className="profile-comp-row">
              <InlineEdit value={typeof item === 'string' ? item : ''} onChange={(v) => updateCompList('logiciels', i, v)} placeholder="ex. Excel, React, Git" />
              <button type="button" className="btn btn-remove" onClick={() => removeCompList('logiciels', i)} title="Supprimer">×</button>
            </div>
          ))}
          <button type="button" className="btn btn-add" onClick={() => addCompList('logiciels', '')}>+ Ajouter</button>
        </div>
        <div className="profile-card">
          <h3 className="sidebar-category">Langues</h3>
          {(comp.langues || []).map((l, i) => (
            <div key={i} className="profile-langue-row">
              <InlineEdit value={l?.langue || ''} onChange={(v) => updateCompList('langues', i, { ...l, langue: v })} placeholder="Langue" />
              <InlineEdit value={l?.niveau || ''} onChange={(v) => updateCompList('langues', i, { ...l, niveau: v })} placeholder="ex. Natif, Courant (C1)" />
              <button type="button" className="btn btn-remove" onClick={() => removeCompList('langues', i)} title="Supprimer">×</button>
            </div>
          ))}
          <button type="button" className="btn btn-add" onClick={() => addCompList('langues', { langue: '', niveau: '' })}>+ Ajouter</button>
        </div>
        <div className="profile-card">
          <h3 className="sidebar-category">Autres</h3>
          {(comp.autres || []).map((item, i) => (
            <div key={i} className="profile-comp-row">
              <InlineEdit value={typeof item === 'string' ? item : ''} onChange={(v) => updateCompList('autres', i, v)} placeholder="ex. Permis B, Piano" />
              <button type="button" className="btn btn-remove" onClick={() => removeCompList('autres', i)} title="Supprimer">×</button>
            </div>
          ))}
          <button type="button" className="btn btn-add" onClick={() => addCompList('autres', '')}>+ Ajouter</button>
        </div>
      </section>
      )}

      {profileSection === 'abonnement' && usage?.plan === 'pro' && !usage?.paywall_disabled && (
        <section className="profile-section-panel">
          <h2 className="ds-label-md">Abonnement</h2>
          <p className="profile-section-desc">Gère la résiliation depuis ici (exigence légale). La facturation détaillée reste disponible sur le portail sécurisé Stripe si besoin.</p>
          {usage.stripe_subscription ? (
            <>
              <p className="profile-subscription-period">
                <strong>Fin de la période en cours :</strong>{' '}
                {usage.stripe_subscription.current_period_end_label || '-'}
                {usage.stripe_subscription.cancel_at_period_end && (
                  <span className="profile-subscription-badge"> Résiliation déjà programmée</span>
                )}
              </p>
              {usage.stripe_subscription.cancel_at_period_end ? (
                <p className="profile-section-desc">
                  Ton abonnement ne sera pas renouvelé. Tu conserves l&apos;accès Pro jusqu&apos;au{' '}
                  <strong>{usage.stripe_subscription.current_period_end_label || 'fin de période indiquée par Stripe'}</strong>
                  , puis ton compte repassera en offre gratuite (sans suppression automatique de tes données).
                </p>
              ) : (
                <>
                  <p className="profile-subscription-legal" role="note">
                    Résilier mon abonnement - La résiliation prend effet à la fin de la période en cours. Vos données restent accessibles jusqu&apos;à cette date.
                  </p>
                  <div className="profile-subscription-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      className="profile-btn-cancel-sub"
                      onClick={() => setCancelSubModalOpen(true)}
                      disabled={cancelSubLoading}
                      {...analyticsAttrs('profil-billing-cta-cancel', 'billing', 'tertiary', 'cta')}
                    >
                      Résilier mon abonnement
                    </Button>
                    {typeof onBillingPortalClick === 'function' && (
                      <Button type="button" variant="secondary" onClick={onBillingPortalClick} {...analyticsAttrs('profil-billing-cta-portal', 'billing', 'tertiary', 'cta')}>
                        Facturation &amp; moyens de paiement (Stripe)
                      </Button>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="profile-subscription-fallback">
              <p className="profile-section-desc">
                Le détail Stripe n&apos;est pas disponible pour l&apos;instant (connexion ou synchronisation). Tu peux ouvrir le portail de facturation pour gérer ton abonnement.
              </p>
              {typeof onBillingPortalClick === 'function' && (
                <Button type="button" variant="secondary" onClick={onBillingPortalClick} {...analyticsAttrs('profil-billing-cta-portal', 'billing', 'tertiary', 'cta')}>
                  Ouvrir le portail de facturation
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {cancelSubModalOpen && (
        <div className="profile-change-email-overlay" onClick={() => !cancelSubLoading && setCancelSubModalOpen(false)} role="dialog" aria-modal="true" aria-labelledby="cancel-sub-title">
          <div className="profile-change-email-modal profile-cancel-sub-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="cancel-sub-title">Confirmer la résiliation</h3>
            <p className="profile-change-email-hint">
              Ta résiliation est effective à la <strong>fin de la période déjà payée</strong>
              {usage?.stripe_subscription?.current_period_end_label ? (
                <> (au plus tard le <strong>{usage.stripe_subscription.current_period_end_label}</strong>)</>
              ) : null}
              . Aucun remboursement automatique de la période en cours : tu conserves l&apos;accès Pro jusqu&apos;à cette date. Un email de confirmation te sera envoyé.
            </p>
            <div className="reauth-actions">
              <Button
                type="button"
                variant="primary"
                disabled={cancelSubLoading}
                loading={cancelSubLoading}
                onClick={async () => {
                  setCancelSubLoading(true);
                  setError('');
                  try {
                    const data = await apiPost('/api/cancel-subscription', {});
                    setCancelSubModalOpen(false);
                    const end = data.current_period_end_label || '';
                    if (data.already_scheduled) {
                      setMessage(`Ta résiliation était déjà programmée. Accès Pro jusqu'au ${end || 'fin de période'}.`);
                    } else {
                      setMessage(
                        `Résiliation enregistrée. Accès Pro jusqu'au ${end || 'fin de période'}. Un email de confirmation t'a été envoyé.`
                      );
                    }
                    onUsageRefresh?.();
                  } catch (err) {
                    setError(err?.message || 'Impossible de résilier pour le moment.');
                  } finally {
                    setCancelSubLoading(false);
                  }
                }}
              >
                {cancelSubLoading ? 'Traitement…' : 'Résilier mon abonnement'}
              </Button>
              <Button type="button" variant="secondary" disabled={cancelSubLoading} onClick={() => setCancelSubModalOpen(false)}>
                Retour
              </Button>
            </div>
          </div>
        </div>
      )}

      </div>

      <div className="profile-preview-pane">
        <div className="profile-preview-pane-top">
          <h2 className="profile-preview-title ds-label-sm">Aperçu du CV</h2>
          <TemplatePicker
            templates={templatesList}
            templateId={templateId}
            templateOptions={templateOptions}
            onChangeTemplate={(id) => { setTemplateId(id); setTemplateOptions({}); }}
            onChangeOptions={setTemplateOptions}
            userPlan={usage?.plan}
            onUpgradeClick={onUpgradeClick}
            optionsPreviewHtml={profilePreviewHtml}
            optionsPreviewLoading={profilePreviewLoading}
            profileLayout={cv?.layout}
            onBetaUnavailable={() => {
              setError('Crée d’abord un design en activant le mode Beta (canvas), puis choisis « Beta » ici.');
            }}
            extraBarLeft={(
              <button
                type="button"
                className="tpl-btn-bar-extra"
                onClick={downloadBaseCvPdf}
                disabled={baseCvPdfLoading || loading}
                title="Télécharger ton CV de profil (tel qu’affiché dans l’aperçu) en PDF"
                {...analyticsAttrs('profil-preview-cta-pdf', 'preview', 'secondary', 'cta')}
              >
                <span className="tpl-btn-bar-extra-icon" aria-hidden>
                  <HiArrowDownTray size={16} strokeWidth={2} />
                </span>
                Exporter en PDF
              </button>
            )}
          />
        </div>
        <div className="profile-preview-pane-scroll" ref={profilePreviewScrollRef}>
          <div className="profile-preview-fit">
          <div className="profile-preview-wrap profile-preview-a4">
            {profilePreviewLoading && !profilePreviewHtml && (
              <p className="profile-preview-empty">Génération de l&apos;aperçu…</p>
            )}
            {!profilePreviewLoading && !profilePreviewHtml && (
              <p className="profile-preview-empty">
                Complète ton profil pour voir le CV.
              </p>
            )}
            {profilePreviewHtml && (
              <iframe
                key={templateKey}
                ref={(el) => { profilePreviewIframeRef.current = el; }}
                title="Aperçu du CV"
                srcDoc={profilePreviewHtml}
                className="profile-preview-iframe"
                scrolling="no"
                onLoad={(e) => resizeProfilePreviewIframe(e.target)}
              />
            )}
          </div>
          </div>
        </div>
      </div>

      {designBridgeOffer && (
        <DesignModeBridgeModal
          offer={designBridgeOffer}
          confirming={designBridgeConfirming}
          variant="profile"
          onConfirm={handleConfirmDesignBridge}
          onDismiss={handleDismissDesignBridge}
        />
      )}

      {linkedinModalOpen && (
        <div className="linkedin-sync-overlay" onClick={() => setLinkedinModalOpen(false)} role="dialog" aria-modal="true">
          <div className="linkedin-sync-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Mise à jour depuis LinkedIn</h3>
            {linkedinError && <div className="linkedin-sync-error">{linkedinError}</div>}
            {linkedinLoading && <p className="linkedin-sync-loading">Récupération du profil…</p>}
            {!linkedinLoading && proposedChanges.length > 0 && (
              <>
                <p className="linkedin-sync-intro">Choisis les changements à appliquer. Les textes seront adaptés au style CV par l’IA.</p>
                <ul className="linkedin-sync-changes">
                  {proposedChanges.map((c) => (
                    <li key={c.id} className="linkedin-sync-change">
                      <label>
                        <input type="checkbox" checked={selectedChangeIds.has(c.id)} onChange={() => toggleChangeSelection(c.id)} />
                        <span className="change-label">{c.label}</span>
                      </label>
                      <div className="change-values">
                        <div className="change-current"><strong>Actuel :</strong> {c.field === 'photo_url' ? formatScalarPreviewForPrivacy('photo_url', c.current_value, 0) : (c.current_value || '-')}</div>
                        <div className="change-new"><strong>LinkedIn :</strong> {c.field === 'photo_url' ? formatScalarPreviewForPrivacy('photo_url', c.linkedin_value, 0) : (c.linkedin_value || '-')}</div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="linkedin-sync-actions">
                  <Button type="button" variant="primary" onClick={handleApplyLinkedInChanges} disabled={linkedinApplyLoading || selectedChangeIds.size === 0} loading={linkedinApplyLoading}>
                    {linkedinApplyLoading ? 'Application…' : `Appliquer ${selectedChangeIds.size} changement(s)`}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setLinkedinModalOpen(false)}>Fermer</Button>
                </div>
              </>
            )}
            {!linkedinLoading && proposedChanges.length === 0 && (
              <>
                {!linkedinError && <p>Aucune mise à jour proposée.</p>}
                <Button type="button" variant="secondary" className="linkedin-sync-close" onClick={() => setLinkedinModalOpen(false)}>Fermer</Button>
              </>
            )}
          </div>
        </div>
      )}
      {importSummary && createPortal(
        <div className="linkedin-sync-overlay import-result-overlay" role="dialog" aria-modal="true" aria-labelledby="import-result-title">
          <div className="linkedin-sync-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="import-result-title">CV importé</h3>
            <p className="linkedin-sync-intro">
              {[importSummary.name, importSummary.title].filter(Boolean).join(' · ') || 'Profil mis à jour.'}
              {` ${importSummary.experiences} expérience${importSummary.experiences > 1 ? 's' : ''}, ${importSummary.formations} formation${importSummary.formations > 1 ? 's' : ''}.`}
            </p>
            <div className="linkedin-sync-actions">
              <Button type="button" variant="primary" onClick={() => setImportSummary(null)}>OK</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
