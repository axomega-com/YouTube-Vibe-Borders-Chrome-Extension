// Verifies the "inject into tabs that were already open" path: the scripting permission,
// the bootstrap file path, and that re-injecting does NOT double-paint (bootstrap guard).
import { spawn } from 'node:child_process';
import { rm, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { findChrome, LAUNCH_FLAGS } from './chrome-path.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROFILE = path.join(ROOT, '.chrome-profile');
const EXT = process.env.E2E_EXT_DIR || path.join(ROOT, 'src');
console.log('extension dir:', EXT);
const PORT = 9339;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws; this.nextId = 0; this.pending = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  }
}

await mkdir(path.join(ROOT, 'out'), { recursive: true });
await rm(PROFILE, { recursive: true, force: true });
const chrome = spawn(findChrome(), [
  `--user-data-dir=${PROFILE}`, `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`,
  `--remote-debugging-port=${PORT}`, ...LAUNCH_FLAGS,
  '--no-first-run', '--no-default-browser-check', '--window-size=1400,1000', 'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });

let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i += 1) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) wsUrl = (await r.json()).webSocketDebuggerUrl; } catch {}
  if (!wsUrl) await sleep(500);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const cdp = new Cdp(ws);
await cdp.send('Target.setDiscoverTargets', { discover: true });
await cdp.send('Target.createTarget', { url: 'about:blank' });

const evaluate = async (session, expression, awaitPromise = false) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, session);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
  return r.result?.value;
};

// find OUR worker by manifest name (extension ids are not stable)
await sleep(4000);
const { targetInfos } = await cdp.send('Target.getTargets');
let swSession = null;
for (const t of targetInfos.filter((x) => x.type === 'service_worker' && x.url.startsWith('chrome-extension://'))) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  try {
    const name = await evaluate(sessionId, 'chrome.runtime.getManifest().name');
    if (name === 'YouTube Vibe Borders') { swSession = sessionId; console.log('found worker:', t.url.split('/')[2]); break; }
  } catch {}
}
if (!swSession) { console.log('FAIL: our service worker not found'); process.exit(1); }

// Seed the key exactly as tools/e2e.mjs does. Without it nothing is painted and the
// "cards survived re-injection" assertion below would be vacuously true.
let apiKey = process.env.YTVB_API_KEY;
if (!apiKey) {
  // Same as tools/e2e.mjs: the key belongs to the harness, so read it from the repo source
  // rather than from the (possibly packaged) directory under test.
  const text = await readFile(path.join(ROOT, 'src', 'config.local.js'), 'utf8');
  apiKey = text.match(/DEV_API_KEY\s*=\s*"([^"]+)"/)?.[1];
}
if (!apiKey) { console.log('FAIL: no API key - run `node tools/set-key.mjs` or set YTVB_API_KEY'); process.exit(1); }
await evaluate(swSession, `chrome.storage.local.set({ apiKey: ${JSON.stringify(apiKey)} }).then(() => 'stored')`, true);
console.log('key seeded from', process.env.YTVB_API_KEY ? 'env' : 'src/config.local.js');

const { sessionId: page } = await cdp.send('Target.attachToTarget', { targetId: targetInfos.find((t) => t.type === 'page').targetId, flatten: true });
await cdp.send('Page.enable', {}, page);
await cdp.send('Network.enable', {}, page);
await cdp.send('Runtime.enable', {}, page);
await cdp.send('Network.setCookie', { name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/', secure: true }, page);
await cdp.send('Page.navigate', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, page);

// let the manifest-registered content script do its thing first
for (let i = 0; i < 20; i += 1) {
  await sleep(3000);
  const n = await evaluate(page, `document.querySelectorAll('[data-ytvb-scored]').length`);
  if (n >= 3) { console.log('baseline scored cards:', n); break; }
}
const before = await evaluate(page, `document.querySelectorAll('[data-ytvb-scored]').length`);

// THE TEST: run the same code path onInstalled uses, against this already-injected tab
const results = await evaluate(swSession, `(async () => {
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  const out = [];
  for (const t of tabs) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: false }, files: ['content/bootstrap.js'] });
      out.push({ id: t.id, ok: true });
    } catch (err) { out.push({ id: t.id, ok: false, error: String(err) }); }
  }
  return JSON.stringify(out);
})()`, true);
console.log('inject result:', results);
await sleep(3000);

const after = await evaluate(page, `JSON.stringify({
  scored: document.querySelectorAll('[data-ytvb-scored]').length,
  badges: document.querySelectorAll('.ytvb-badge').length,
  duplicateBadgeCards: [...document.querySelectorAll('[data-ytvb-scored]')].filter((el) => el.querySelectorAll('.ytvb-badge').length > 1).length,
  outlinesPerCard: [...document.querySelectorAll('[data-ytvb-scored]')].filter((el) => el.style.outlineWidth !== '').length,
})`);
console.log('after re-inject:', after);

const parsed = JSON.parse(results);
const state = JSON.parse(after);
const okInjects = parsed.length > 0 && parsed.every((r) => r.ok);
const noDupes = state.duplicateBadgeCards === 0;
const survived = state.scored >= before && before > 0;
console.log('');
console.log(okInjects ? 'PASS inject path works' : 'FAIL inject errored');
console.log(noDupes ? 'PASS bootstrap guard held (no duplicate badges)' : 'FAIL double-painted');
console.log(survived ? `PASS page kept its ${state.scored} painted cards` : `FAIL lost cards (${before} -> ${state.scored})`);
process.exit(okInjects && noDupes && survived ? 0 : 1);
