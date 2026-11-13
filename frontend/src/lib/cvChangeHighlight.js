function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wordKey(word) {
  return String(word || '')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** Indices du texte courant qui appartiennent au plus long sous-texte commun. */
function lcsMask(baseWords, currentWords) {
  const n = baseWords.length;
  const m = currentWords.length;
  const baseKeys = baseWords.map(wordKey);
  const currentKeys = currentWords.map(wordKey);
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const same = baseKeys[i - 1].length > 0 && baseKeys[i - 1] === currentKeys[j - 1];
      dp[i][j] = same
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const inLcs = new Array(m).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const same = baseKeys[i - 1].length > 0 && baseKeys[i - 1] === currentKeys[j - 1];
    if (same && dp[i][j] === dp[i - 1][j - 1] + 1) {
      inLcs[j - 1] = true;
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return inLcs;
}

/**
 * Découpe le texte adapté en morceaux égaux ou modifiés (même idée que le HTML classique).
 * @returns {{ changed: boolean, text: string }[]}
 */
export function diffHighlightParts(base, current) {
  const baseText = String(base ?? '').trim();
  const currentText = String(current ?? '').trim();
  if (!currentText) return [];
  if (baseText === currentText) return [{ changed: false, text: currentText }];
  const baseLines = baseText.split('\n');
  const currentLines = currentText.split('\n');
  const parts = [];
  currentLines.forEach((line, lineIndex) => {
    if (lineIndex > 0) parts.push({ changed: false, text: '\n' });
    const baseLine = baseLines[lineIndex] || '';
    if (baseLine === line) {
      if (line) parts.push({ changed: false, text: line });
      return;
    }
    const baseWords = baseLine.split(/\s+/).filter(Boolean);
    const currentWords = line.split(/\s+/).filter(Boolean);
    let buf = [];
    let changed = null;
    const flush = () => {
      if (!buf.length) return;
      parts.push({ changed: Boolean(changed), text: buf.join(' ') });
      buf = [];
    };
    const inLcs = lcsMask(baseWords, currentWords);
    currentWords.forEach((word, idx) => {
      const wordChanged = !inLcs[idx];
      if (changed !== null && wordChanged !== changed) flush();
      changed = wordChanged;
      buf.push(word);
    });
    flush();
  });
  return parts;
}

/** HTML du surlignage `cv-changed`, comme les templates classiques. */
export function diffHighlightHtml(base, current) {
  const parts = diffHighlightParts(base, current);
  let html = '';
  parts.forEach((part, index) => {
    if (part.text === '\n') {
      html += '<br>';
      return;
    }
    const prev = parts[index - 1];
    if (prev && prev.text !== '\n') html += ' ';
    const escaped = escapeHtml(part.text);
    html += part.changed ? `<span class="cv-changed">${escaped}</span>` : escaped;
  });
  return html;
}
