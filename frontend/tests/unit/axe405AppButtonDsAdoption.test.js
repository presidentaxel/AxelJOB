/**
 * AXE-405 : plus de markup `className="button button-*"` dans frontend/src,
 * hors helper d’alias (buttonClassName.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = path.join(FRONTEND_ROOT, 'src');

const LEGACY_BUTTON_CLASS_RE =
  /(?:className|class)\s*=\s*(?:["'`][^"'`]*|\{\s*["'`][^"'`]*)\bbutton-(?:primary|secondary|tertiary|ghost|success)\b/;

const SKIP = new Set([
  path.join(SRC, 'lib', 'buttonClassName.js'),
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else if (/\.(jsx|js)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

test('frontend/src n’a plus de className button button-* hors helper', async () => {
  const offenders = [];
  for (const file of await walk(SRC)) {
    if (SKIP.has(file)) continue;
    const text = await readFile(file, 'utf8');
    const rel = path.relative(SRC, file);
    text.split('\n').forEach((line, idx) => {
      if (LEGACY_BUTTON_CLASS_RE.test(line)) {
        offenders.push(`${rel}:${idx + 1}:${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});

test('Support, export, upgrade et monitoring gardent leurs data-attr', async () => {
  const app = await readFile(path.join(SRC, 'App.jsx'), 'utf8');
  const monitoring = await readFile(path.join(SRC, 'components', 'MonitoringDashboard.jsx'), 'utf8');
  assert.match(app, /analyticsAttrs\('support-ticket-cta-submit', 'ticket', 'primary', 'cta'\)/);
  assert.match(app, /analyticsAttrs\('cv-export-cta-pdf', 'export', 'primary', 'cta'\)/);
  assert.match(app, /analyticsAttrs\('cv-export-cta-dossier', 'export', 'secondary', 'cta'\)/);
  assert.match(app, /analyticsAttrs\('cv-banner-cta-upgrade', 'banner', 'primary', 'cta'\)/);
  assert.match(app, /analyticsAttrs\('cv-header-cta-new', 'header', 'secondary', 'cta'\)/);
  assert.match(app, /variant="success"/);
  assert.match(monitoring, /analyticsAttrs\('monitoring-header-cta-refresh', 'header', 'secondary', 'cta'\)/);
  assert.match(monitoring, /import Button from '\.\/ui\/Button\.jsx'/);
});
