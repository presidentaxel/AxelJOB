import { memo, Suspense, useCallback, useEffect, useState } from 'react';
import { lazyWithChunkReload } from '../../lib/lazyChunkReload.js';
import { applyCvFieldsFromRoot, readBlockContentFromRoot, repairCanvasPlaceholderGlue } from '../../lib/canvasInlineEdit.js';
import { findBlock } from '../../lib/cvLayoutModelV3.js';
import {
  applyCanvasFitText,
  resolveBetaCanvasPreview,
  resolveBetaPreviewCv,
} from '../../lib/betaCanvasTemplate.js';

const FreeCanvas = lazyWithChunkReload(() => import('./FreeCanvas.jsx'));
const NO_CANVAS_CONFLICTS = [];

function plainPreviewText(html) {
  return repairCanvasPlaceholderGlue(String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim());
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
        return { ...rest, content };
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
  fitNotice = '',
  onConflicts,
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
  const conflicts = betaCanvas?.conflicts ?? NO_CANVAS_CONFLICTS;
  const conflictKey = conflicts.map((item) => `${item.key}:${item.maxChars}:${item.text}`).join('|');
  useEffect(() => {
    if (typeof onConflicts === 'function') onConflicts(conflicts);
  }, [conflictKey, conflicts, onConflicts]);
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
      const plain = plainPreviewText(readBlockContentFromRoot(rootEl));
      if (block.previewField) {
        onCvChange(applyCanvasFitText(betaCanvas.cv, block.previewField, plain), block.previewField);
        return;
      }
      onCvChange({
        ...betaCanvas.cv,
        layout: layoutWithBlockText(betaCanvas.layout, blockId, plain),
      }, null);
      return;
    }
    onCvChange(applyCvFieldsFromRoot(betaCanvas.cv, rootEl), null);
  }, [textEditable, onCvChange, betaCanvas]);
  if (!betaCanvas) return null;
  return (
    <div className="cv-beta-live-preview" data-testid="cv-beta-live-preview">
      {fitNotice ? <p className="cv-beta-fit-notice ds-body-md" role="status">{fitNotice}</p> : null}
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
