/**
 * Échoue si tokens.json et l'un des CSS générés divergent
 * (ds-tokens.generated.css pour React, public/ds-tokens.css pour les pages statiques).
 *
 * npm run tokens && git diff --exit-code -- <fichiers générés>
 *
 * Usage: node scripts/check-token-drift.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(__dirname, '..');
const REPO_ROOT = join(FRONTEND_ROOT, '..');
export const GENERATED_RELS = [
  'frontend/src/styles/ds-tokens.generated.css',
  'frontend/public/ds-tokens.css',
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

export function checkTokenDrift({
  frontendRoot = FRONTEND_ROOT,
  repoRoot = REPO_ROOT,
  generatedRels = GENERATED_RELS,
} = {}) {
  const tokens = run('node', ['scripts/build-tokens.mjs'], frontendRoot);
  if (tokens.status !== 0) {
    return {
      ok: false,
      message: tokens.stderr || tokens.stdout || 'npm run tokens failed',
    };
  }

  const diff = run('git', ['diff', '--exit-code', '--', ...generatedRels], repoRoot);
  if (diff.status === 0) {
    return { ok: true, message: 'token drift: OK' };
  }
  if (diff.status === 1) {
    return {
      ok: false,
      message:
        `${generatedRels.join(' / ')} a divergé de tokens.json.\n` +
        `Régénérer : npm --prefix frontend run tokens, puis committer les fichiers.\n` +
        (diff.stdout || diff.stderr || ''),
    };
  }
  return {
    ok: false,
    message: diff.stderr || `git diff failed (status ${diff.status})`,
  };
}

function main() {
  const result = checkTokenDrift();
  if (!result.ok) {
    process.stderr.write(`${result.message}\n`);
    process.exit(1);
  }
  process.stdout.write(`${result.message}\n`);
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  main();
}
