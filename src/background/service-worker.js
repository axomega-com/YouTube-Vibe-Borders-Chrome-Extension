import { buildPrompt, parseModelJson, mergeResults, BATCH_SIZE } from '../lib/prompt.js';
import { makeCache } from '../lib/cache.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'typesafe/jev-router';
const MAX_ATTEMPTS = 3;

const cache = makeCache(chrome.storage.local);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read the key on every request rather than at boot: MV3 service workers are
 * killed after ~30s idle, so a module-level value would go stale after the user
 * saves a new key.
 */
async function resolveKey() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (apiKey) return apiKey;
  try {
    const dev = await import('./config.local.js'); // gitignored, dev-only fallback
    return dev.DEV_API_KEY || null;
  } catch {
    return null;
  }
}

async function resolveModel() {
  const { model } = await chrome.storage.local.get('model');
  return model || DEFAULT_MODEL;
}

async function callOpenRouter(videos, apiKey, model) {
  const { system, user } = buildPrompt(videos);
  const body = {
    model,
    temperature: 0,
    max_tokens: 700,
    // Deliberately no response_format: not every OpenRouter model supports it,
    // and parseModelJson is tolerant of prose and code fences.
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-Title': 'YouTube Vibe Borders',
    'HTTP-Referer': chrome.runtime.getURL(''),
  };

  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.ok) {
      const json = await res.json();
      return {
        rows: parseModelJson(json?.choices?.[0]?.message?.content ?? ''),
        model: json?.model ?? model,
        usage: json?.usage ?? null,
      };
    }
    const text = await res.text();
    lastError = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    if (res.status === 401 || res.status === 403) {
      lastError.code = 'NO_KEY';
      break;
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    break;
  }
  throw lastError;
}

async function handleScore(videos) {
  const ids = (videos ?? []).map((v) => v.videoId);
  const { hit, miss } = await cache.getMany(ids);
  const out = { ...hit };
  const todo = (videos ?? []).filter((v) => miss.includes(v.videoId));
  if (!todo.length) return { scores: out, cached: ids.length };

  const apiKey = await resolveKey();
  if (!apiKey) return { scores: out, error: 'NO_KEY' };

  const model = await resolveModel();
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const chunk = todo.slice(i, i + BATCH_SIZE);
    try {
      const { rows } = await callOpenRouter(chunk, apiKey, model);
      const scored = Object.fromEntries(mergeResults(chunk, rows));
      await cache.putMany(scored);
      Object.assign(out, scored);
    } catch (err) {
      return {
        scores: out,
        error: err?.code === 'NO_KEY' ? 'NO_KEY' : 'UPSTREAM',
        detail: String(err?.message || err),
      };
    }
  }
  return { scores: out, scored: todo.length };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'ytvb:score') return false;
  handleScore(msg.videos)
    .then(sendResponse)
    .catch((err) => sendResponse({ scores: {}, error: 'UPSTREAM', detail: String(err?.message || err) }));
  return true; // REQUIRED: keeps the message channel open for the async reply
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'ytvb:cacheSize') return false;
  cache.size().then((size) => sendResponse({ size }));
  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'ytvb:clearCache') return false;
  cache.clear().then(() => sendResponse({ ok: true }));
  return true;
});

console.log('[ytvb] service worker booted');
