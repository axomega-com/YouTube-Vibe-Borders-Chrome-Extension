import { buildPrompt, parseModelJson, mergeResults, BATCH_SIZE } from '../lib/prompt.js';
import { makeCache } from '../lib/cache.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'typesafe/jev-router';
const MAX_ATTEMPTS = 3;

const cache = makeCache(chrome.storage.local);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The key lives in chrome.storage.local, written by the options page (or injected by the
 * test harness). Read it per request rather than at boot: MV3 workers are killed after
 * ~30s idle, so a module-level value would go stale right after the user saves a new key.
 *
 * Do NOT try to import a dev key file here. Dynamic import() is disallowed on
 * ServiceWorkerGlobalScope by the HTML spec (w3c/ServiceWorker#1356); it throws, and a
 * swallowing catch turns the extension into one that silently "has no key".
 */
async function resolveKey() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  return apiKey || null;
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
      console.log(`[ytvb] scored ${Object.keys(scored).length}/${chunk.length} videos (${rows.length} rows back)`);
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

/**
 * Content scripts declared in the manifest do NOT appear in tabs that were already open when
 * the extension was installed or reloaded. Without this, anyone who installs while YouTube is
 * open sees nothing at all, and reasonably concludes the extension is broken.
 */
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  let injected = 0;
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false },
        files: ['content/bootstrap.js'],
      });
      injected += 1;
    } catch (err) {
      console.warn('[ytvb] could not inject into tab', tab.id, String(err));
    }
  }
  return injected;
}

chrome.runtime.onInstalled.addListener((details) => {
  injectIntoOpenTabs().then((count) => console.log(`[ytvb] ${details.reason}: injected into ${count} open YouTube tab(s)`));
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'ytvb:injectNow') return false;
  injectIntoOpenTabs()
    .then((count) => sendResponse({ count }))
    .catch((err) => sendResponse({ count: 0, error: String(err) }));
  return true;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'ytvb:clearCache') return false;
  cache.clear().then(() => sendResponse({ ok: true }));
  return true;
});

console.log('[ytvb] service worker booted');
