import { spawn } from 'node:child_process';
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { findChrome, LAUNCH_FLAGS } from './chrome-path.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROFILE = path.join(ROOT, '.chrome-profile');
const EXT = path.join(ROOT, 'src');
const PORT = 9337;
const URLS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/results?search_query=news',
  'https://www.youtube.com/@RickAstleyYT/videos',
];
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
const { targetInfos } = await cdp.send('Target.getTargets');
const { sessionId: page } = await cdp.send('Target.attachToTarget', { targetId: targetInfos.find((t) => t.type === 'page').targetId, flatten: true });
await cdp.send('Page.enable', {}, page);
await cdp.send('Network.enable', {}, page);
await cdp.send('Runtime.enable', {}, page);
await cdp.send('Network.setCookie', { name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/', secure: true }, page);
const ev = async (expr) => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, page)).result?.value;

const DUMP = `JSON.stringify({
  lockups: [...document.querySelectorAll('yt-lockup-view-model')].slice(0, 2).map((card) => ({
    anchors: [...card.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), cls: String(a.className).slice(0, 34), hidden: a.getAttribute('aria-hidden'), text: (a.textContent || '').trim().slice(0, 44) })),
    imgAlt: card.querySelector('img') && card.querySelector('img').getAttribute('alt'),
    blob: (card.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 90),
  })),
  ytdVideo: [...document.querySelectorAll('ytd-video-renderer')].slice(0, 2).map((card) => ({
    anchors: [...card.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), id: a.id, cls: String(a.className).slice(0, 30), text: (a.textContent || '').trim().slice(0, 44) })),
    imgAlt: card.querySelector('img') && card.querySelector('img').getAttribute('alt'),
    blob: (card.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 90),
  })),
  richItems: document.querySelectorAll('ytd-rich-item-renderer').length,
  counts: {
    lockup: document.querySelectorAll('yt-lockup-view-model').length,
    ytdVideo: document.querySelectorAll('ytd-video-renderer').length,
    ytdCompact: document.querySelectorAll('ytd-compact-video-renderer').length,
    anchorsWithImg: [...document.querySelectorAll('a[href*="/watch?v="]')].filter((a) => a.querySelector('img')).length,
    anchorsAll: document.querySelectorAll('a[href*="/watch?v="]').length,
  },
}, null, 1)`;

for (const url of URLS) {
  await cdp.send('Page.navigate', { url }, page);
  await sleep(14000);
  await ev('scrollTo(0, 1600)');
  await sleep(7000);
  console.log(`\n================= ${url}`);
  console.log(await ev(DUMP));
}
process.exit(0);
