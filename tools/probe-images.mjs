// Why do search-result thumbnails stay blank while watch-page ones load?
// Records the network activity AND the per-anchor image state on both surfaces.
import { spawn } from 'node:child_process';
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { findChrome, LAUNCH_FLAGS } from './chrome-path.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROFILE = path.join(ROOT, '.chrome-profile');
const PORT = 9343;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws; this.nextId = 0; this.pending = new Map(); this.handlers = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); return; }
      if (m.method) for (const h of this.handlers) h(m);
    });
  }
  on(fn) { this.handlers.push(fn); }
  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  }
}

await mkdir(path.join(ROOT, 'out'), { recursive: true });
await rm(PROFILE, { recursive: true, force: true });
const chrome = spawn(findChrome(), [
  `--user-data-dir=${PROFILE}`, `--load-extension=${path.join(ROOT, 'src')}`,
  `--disable-extensions-except=${path.join(ROOT, 'src')}`, `--remote-debugging-port=${PORT}`,
  ...LAUNCH_FLAGS, '--no-first-run', '--no-default-browser-check', '--window-size=1400,1000', 'about:blank',
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
const { targetInfos } = await cdp.send('Target.getTargets');
const { sessionId: page } = await cdp.send('Target.attachToTarget', { targetId: targetInfos.find((t) => t.type === 'page').targetId, flatten: true });
await cdp.send('Page.enable', {}, page);
await cdp.send('Network.enable', {}, page);
await cdp.send('Runtime.enable', {}, page);
await cdp.send('Network.setCookie', { name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/', secure: true }, page);

const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, page)).result?.value;

let requests = [];
let failures = [];
let statuses = new Map();
cdp.on((m) => {
  if (m.sessionId !== page) return;
  if (m.method === 'Network.requestWillBeSent' && /ytimg|ggpht/.test(m.params.request.url)) requests.push(m.params.request.url);
  if (m.method === 'Network.loadingFailed') failures.push(`${m.params.type} ${m.params.errorText}`);
  if (m.method === 'Network.responseReceived' && /ytimg|ggpht/.test(m.params.response.url)) statuses.set(m.params.response.status, (statuses.get(m.params.response.status) || 0) + 1);
});

const DUMP = `JSON.stringify({
  anchors: [...document.querySelectorAll('[data-ytvb-scored]')].slice(0, 3).map((a) => ({
    href: (a.getAttribute('href') || '').slice(0, 28),
    imgs: [...a.querySelectorAll('img')].map((i) => ({
      hasSrc: Boolean(i.getAttribute('src')),
      dataSrc: (i.getAttribute('data-src') || '').slice(0, 40),
      complete: i.complete,
      naturalWidth: i.naturalWidth,
      inViewport: i.getBoundingClientRect().top < innerHeight && i.getBoundingClientRect().bottom > 0,
    })),
  })),
  stats: {
    images: document.images.length,
    noSrc: [...document.images].filter((i) => !i.getAttribute('src')).length,
    zeroWidth: [...document.images].filter((i) => i.getAttribute('src') && i.naturalWidth === 0).length,
    loaded: [...document.images].filter((i) => i.naturalWidth > 0).length,
  },
}, null, 1)`;

for (const url of ['https://www.youtube.com/results?search_query=news', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']) {
  requests = []; failures = []; statuses = new Map();
  await cdp.send('Page.navigate', { url }, page);
  await sleep(12000);
  await evaluate('scrollTo(0, 600)');
  await sleep(5000);
  await evaluate('scrollTo(0, 0)');
  await sleep(4000);
  console.log(`\n================= ${url}`);
  console.log('ytimg requests:', requests.length, '| response statuses:', JSON.stringify([...statuses]));
  console.log('load failures:', failures.length ? JSON.stringify([...new Set(failures)]) : 'none');
  console.log(await evaluate(DUMP));
}
process.exit(0);
