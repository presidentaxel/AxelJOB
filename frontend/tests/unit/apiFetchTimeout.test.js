import assert from 'node:assert/strict';
import test from 'node:test';
import {
  API_REQUEST_TIMEOUT_MS,
  CV_IMPORT_REQUEST_TIMEOUT_MS,
  fetchWithDeadline,
} from '../../src/lib/fetchWithDeadline.js';

function hangingFetch(_url, options) {
  return new Promise((_resolve, reject) => {
    const fail = () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    };
    if (options.signal?.aborted) fail();
    else options.signal?.addEventListener('abort', fail, { once: true });
  });
}

test('l’import CV attend plus longtemps qu’une lecture', () => {
  assert.ok(CV_IMPORT_REQUEST_TIMEOUT_MS > API_REQUEST_TIMEOUT_MS);
  assert.ok(CV_IMPORT_REQUEST_TIMEOUT_MS >= 60_000);
});

test('fetchWithDeadline abandonne une requête qui ne répond pas', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = hangingFetch;
  try {
    await assert.rejects(
      () => fetchWithDeadline('http://127.0.0.1:9/hang', {}, 40),
      (error) => error.name === 'TimeoutError' && /serveur ne répond pas/.test(error.message),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('fetchWithDeadline laisse passer un abandon demandé', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = hangingFetch;
  try {
    const pending = fetchWithDeadline('http://127.0.0.1:9/hang', { signal: controller.signal }, 5000);
    controller.abort();
    await assert.rejects(pending, (error) => error.name === 'AbortError');
  } finally {
    globalThis.fetch = original;
  }
});
