import { findCards, extractMeta, BADGE_CLASS, STYLE_ID, BANNER_ID } from '../lib/selectors.js';
import { injectStyles, applyScore } from './overlay.js';

const ATTEMPTS = new Map(); // videoId -> how many times we have asked about it
const MAX_ATTEMPTS_PER_VIDEO = 2; // a model that omits a video gets exactly one retry
const CARDS = new Map(); // videoId -> card element
let timer = null;

function nearViewport(card) {
  const rect = card.getBoundingClientRect();
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
    const card = CARDS.get(meta.videoId);
    const score = res.scores?.[meta.videoId];
    if (card?.isConnected && score) applyScore(card, score);
  }
}

async function pump() {
  const batch = [];
  for (const card of findCards()) {
    if (card.dataset.ytvbScored || card.dataset.ytvbPending) continue;
    if (!nearViewport(card)) continue;
    const meta = extractMeta(card);
    if (!meta) continue;
    const tries = ATTEMPTS.get(meta.videoId) ?? 0;
    if (tries >= MAX_ATTEMPTS_PER_VIDEO) continue;
    card.dataset.ytvbPending = '1';
    CARDS.set(meta.videoId, card);
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
    for (const meta of batch) CARDS.get(meta.videoId)?.removeAttribute('data-ytvb-pending');
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

  // Rescan when the user asks, from the popup.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'ytvb:rescan') return;
    ATTEMPTS.clear();
    for (const card of findCards()) card.removeAttribute('data-ytvb-scored');
    schedule();
  });

  schedule();
  new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  console.log('[ytvb] content script started');
}
