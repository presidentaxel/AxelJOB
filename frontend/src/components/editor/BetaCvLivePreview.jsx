import { memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { lazyWithChunkReload } from '../../lib/lazyChunkReload.js';
import {
  applyCvFieldsFromRoot,
  htmlToPlainText,
  readBlockContentFromRoot,
  repairCanvasPlaceholderGlue,
  sanitizeRichTextHtml,
} from '../../lib/canvasInlineEdit.js';
import { findBlock } from '../../lib/cvLayoutModelV3.js';
import {
  applyCanvasFitText,
  resolveBetaCanvasPreview,
  resolveBetaPreviewCv,
} from '../../lib/betaCanvasTemplate.js';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';

const FreeCanvas = lazyWithChunkReload(() => import('./FreeCanvas.jsx'));

function plainPreviewText(html) {
  return repairCanvasPlaceholderGlue(htmlToPlainText(html).trim());
}

function editableBlockHtml(rootEl) {
  const raw = String(readBlockContentFromRoot(rootEl) || '')
    .replace(/<div><br\s*\/?><\/div>/gi, '<br>')
    .replace(/<\/div>\s*<div>/gi, '<br>')
    .replace(/<\/?div>/gi, '')
    .replace(/\n/g, '<br>');
  return sanitizeRichTextHtml(raw);
}

function layoutWithBlockText(layout, blockId, content) {
  if (!layout?.pages) return layout;
  return {
    ...layout,
    pages: layout.pages.map((page) => ({
      ...page,
      blocks: (page.blocks || []).map((block) => {
        if (!block || block.id !== blockId) return block;
        const { previewField: _previewField, ...rest } = block;
        const style = { ...(rest.style || {}) };
        if (/<br\b/i.test(String(content || '')) && style.align !== 'center' && style.align !== 'right') {
          style.align = 'justify';
        }
        return { ...rest, style, content };
      }),
    })),
  };
}

/**
 * Aperçu canvas Beta. Mémoïsé : la saisie du chat ne le reconstruit pas.
 */
function BetaCvLivePreview({
  templateId,
  profileLayout,
  previewVariant,
  lastAdaptedCv,
  lastBaseCv,
  languagePreviewStatus,
  languagePreviewCv,
  freshPreviewPhotoUrl,
  textEditable = false,
  onCvChange,
}) {
  const [editingBlockId, setEditingBlockId] = useState(null);
  const localizedCv = !lastAdaptedCv
    && previewVariant === 'modified'
    && languagePreviewStatus === 'ready'
    && languagePreviewCv
    && typeof languagePreviewCv === 'object'
    ? languagePreviewCv
    : null;
  const betaPreviewCv = resolveBetaPreviewCv({
    previewVariant,
    lastAdaptedCv,
    lastBaseCv,
    localizedCv,
    freshPreviewPhotoUrl,
  });
  const betaCanvas = resolveBetaCanvasPreview({
    templateId,
    profileLayout,
    cv: betaPreviewCv,
    baseCv: lastBaseCv,
    highlightChanges: previewVariant === 'modified' && Boolean(lastAdaptedCv),
  });
  const overlapKey = (betaCanvas?.conflicts || [])
    .map((row) => `${row.hostId}:${row.otherId}`)
    .join('|');
  const [overlapOpen, setOverlapOpen] = useState(false);
  const dismissedOverlapRef = useRef('');
  useEffect(() => {
    if (!overlapKey) {
      setOverlapOpen(false);
      return;
    }
    if (dismissedOverlapRef.current === overlapKey) return;
    setOverlapOpen(true);
  }, [overlapKey]);
  const closeOverlap = useCallback(() => {
    dismissedOverlapRef.current = overlapKey;
    setOverlapOpen(false);
  }, [overlapKey]);
  useEffect(() => {
    if (!textEditable) setEditingBlockId(null);
  }, [textEditable]);
  const startTextEdit = useCallback((blockId) => {
    if (!textEditable || !blockId) return;
    setEditingBlockId(blockId);
  }, [textEditable]);
  const commitTextEdit = useCallback((blockId, rootEl) => {
    setEditingBlockId(null);
    if (!textEditable || typeof onCvChange !== 'function' || !betaCanvas || !blockId) return;
    const block = findBlock(betaCanvas.layout, blockId)?.block;
    if (!block) return;
    if (block.type === 'text' || block.type === 'title') {
      const html = editableBlockHtml(rootEl);
      const plain = plainPreviewText(html);
      if (!plain || plain === plainPreviewText(block.content)) return;
      const next = block.previewField
        ? applyCanvasFitText(betaCanvas.cv, block.previewField, plain)
        : betaCanvas.cv;
      onCvChange({
        ...next,
        layout: layoutWithBlockText(betaCanvas.layout, blockId, html),
      }, null);
      return;
    }
    onCvChange(applyCvFieldsFromRoot(betaCanvas.cv, rootEl), null);
  }, [textEditable, onCvChange, betaCanvas]);
  if (!betaCanvas) return null;
  return (
    <div className="cv-beta-live-preview" data-testid="cv-beta-live-preview">
      <ConfirmDialog
        open={overlapOpen}
        title="Certains éléments se chevauchent"
        message="L’adaptation a laissé chaque élément à sa place. Il n’y a pas assez de place pour tout le texte : des éléments passent les uns sur les autres. Vérifie le CV avant de l’envoyer."
        confirmLabel="Vérifier le CV"
        hideCancel
        onConfirm={closeOverlap}
        onCancel={closeOverlap}
      />
      <Suspense fallback={<p className="ds-body-md">Chargement de l’aperçu Beta…</p>}>
        <FreeCanvas
          layout={betaCanvas.layout}
          cv={betaCanvas.cv}
          baseCv={previewVariant === 'modified' && lastAdaptedCv ? lastBaseCv : null}
          interactable={false}
          textEditable={textEditable}
          editingBlockId={editingBlockId}
          onStartBlockEdit={startTextEdit}
          onCommitBlockEdit={commitTextEdit}
          hideEmptyState
        />
      </Suspense>
    </div>
  );
}

export default memo(BetaCvLivePreview);
