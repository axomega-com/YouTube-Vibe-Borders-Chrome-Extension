import { findThumbAnchors, extractMeta, BADGE_CLASS, STYLE_ID, BANNER_ID } from '../lib/selectors.js';
import { injectStyles, applyScore } from './overlay.js';

const ATTEMPTS = new Map(); // videoId -> how many times we have asked about it
const MAX_ATTEMPTS_PER_VIDEO = 2; // a model that omits a video gets exactly one retry
const TARGETS = new Map(); // videoId -> every anchor on the page showing that video
let timer = null;

function nearViewport(el) {
  const rect = el.getBoundingClientRect();
  return rect.bottom > -400 && rect.top < innerHeight + 800;
}

function showBanner(text) {
  if (document.getElementById(BANNER_ID)) return;
  const el = document.createElement('div');
  el.id = BANNER_ID;
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed', zIndex: '9999', left: '12px', bottom: '12px',
    padding: '8px 12px', font: '600 12px Roboto, Arial, sans-serif',
    color: '#fff', background: 'rgba(20,20,20,.92)',
    border: '1px solid #444', borderRadius: '8px',
  });
  document.body.appendChild(el);
}

function applyResponse(res, batch) {
  if (!res) return;
  if (res.error === 'NO_KEY') {
    showBanner('YouTube Vibe Borders: add your OpenRouter key in the extension options.');
    return;
  }
  if (res.error) console.warn('[ytvb] scorer error:', res.error, res.detail ?? '');
  for (const meta of batch) {
    const score = res.scores?.[meta.videoId];
    if (!score) continue;
    for (const el of TARGETS.get(meta.videoId) ?? []) {
      if (el.isConnected) applyScore(el, score, meta);
    }
  }
}

async function pump() {
  const batch = [];
  for (const anchor of findThumbAnchors()) {
    if (anchor.dataset.ytvbScored || anchor.dataset.ytvbPending) continue;
    if (!nearViewport(anchor)) continue;
    const meta = extractMeta(anchor);
    if (!meta) continue;
    const tries = ATTEMPTS.get(meta.videoId) ?? 0;
    if (tries >= MAX_ATTEMPTS_PER_VIDEO) continue;

    // One video can be on screen several times; register every anchor so they all get painted.
    TARGETS.set(meta.videoId, [...(TARGETS.get(meta.videoId) ?? []), anchor]);
    if (batch.some((m) => m.videoId === meta.videoId)) continue; // already queued this pass

    anchor.dataset.ytvbPending = '1';
    ATTEMPTS.set(meta.videoId, tries + 1);
    batch.push(meta);
    if (batch.length >= 10) break;
  }
  if (!batch.length) return;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'ytvb:score', videos: batch });
    applyResponse(res, batch);
  } catch (err) {
    // Service worker restart mid-flight: refund the attempt so these are retried.
    console.warn('[ytvb] sendMessage failed:', err);
    for (const meta of batch) ATTEMPTS.set(meta.videoId, Math.max(0, (ATTEMPTS.get(meta.videoId) ?? 1) - 1));
  } finally {
    for (const meta of batch) {
      for (const el of TARGETS.get(meta.videoId) ?? []) el.removeAttribute('data-ytvb-pending');
    }
  }
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    scheduled = false;
    await pump();
    if (document.querySelector('[data-ytvb-pending]')) schedule();
  }, 400);
}

/** Ignore mutations caused by our own badge/style insertions. */
function isOurs(node) {
  if (!(node instanceof Element)) return false;
  return node.classList.contains(BADGE_CLASS) || node.id === STYLE_ID || node.id === BANNER_ID;
}
function onMutations(records) {
  if (records.some((r) => Array.from(r.addedNodes).some((n) => !isOurs(n)))) schedule();
}

export function start() {
  injectStyles();

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // So the popup can tell the user whether this tab is actually running the script.
    if (msg?.type === 'ytvb:status') {
      sendResponse({
        cards: findThumbAnchors().length,
        scored: document.querySelectorAll('[data-ytvb-scored]').length,
      });
      return;
    }
    if (msg?.type !== 'ytvb:rescan') return;
    ATTEMPTS.clear();
    TARGETS.clear();
    for (const el of findThumbAnchors()) el.removeAttribute('data-ytvb-scored');
    schedule();
  });

  schedule();
  new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  console.log('[ytvb] content script started');
}
