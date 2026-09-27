/**
 * Captures Chrome Web Store screenshots at exactly 1280x800 (the size the store accepts)
 * by overriding the viewport, not by trusting the window size.
 *
 *   node tools/store-assets.mjs      ->  out/store/screenshot-*.png
 */
import { spawn } from 'node:child_process';
import { rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { findChrome, LAUNCH_FLAGS } from './chrome-path.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROFILE = path.join(ROOT, '.chrome-profile');
const EXT = process.env.E2E_EXT_DIR || path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'out', 'store');
const PORT = 9341;
const W = 1280;
const H = 800;

// [label, url, requiresPaintedThumbnails]. The options page is our own UI and has no
// YouTube cards, so card assertions do not apply to it.
const YOUTUBE_SURFACES = [
  ['1-search-results', 'https://www.youtube.com/results?search_query=news', true],
  ['2-watch-page', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', true],
  ['3-channel-videos', 'https://www.youtube.com/@RickAstleyYT/videos', true],
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

await mkdir(OUT, { recursive: true });
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
};

// find OUR worker by manifest name, never by being the first chrome-extension:// target
await sleep(4000);
const { targetInfos } = await cdp.send('Target.getTargets');
let swSession = null;
let extId = null;
for (const t of targetInfos.filter((x) => x.type === 'service_worker' && x.url.startsWith('chrome-extension://'))) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  try {
    if ((await evaluate(sessionId, 'chrome.runtime.getManifest().name')) === 'Vibe Borders for YouTube') {
      swSession = sessionId;
      extId = t.url.split('/')[2];
      break;
    }
  } catch {}
}
if (!swSession) { console.log('FAIL: our service worker not found'); process.exit(1); }

let apiKey = process.env.YTVB_API_KEY;
if (!apiKey) {
  const text = await readFile(path.join(ROOT, 'src', 'config.local.js'), 'utf8');
  apiKey = text.match(/DEV_API_KEY\s*=\s*"([^"]+)"/)?.[1];
}
if (!apiKey) { console.log('FAIL: no API key - run `node tools/set-key.mjs`'); process.exit(1); }
await evaluate(swSession, `chrome.storage.local.set({ apiKey: ${JSON.stringify(apiKey)} }).then(() => 'ok')`, true);

const { sessionId: page } = await cdp.send('Target.attachToTarget', { targetId: targetInfos.find((t) => t.type === 'page').targetId, flatten: true });
await cdp.send('Page.enable', {}, page);
await cdp.send('Network.enable', {}, page);
await cdp.send('Runtime.enable', {}, page);
await cdp.send('Network.setCookie', { name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/', secure: true }, page);
// Deliberately NO Emulation.setDeviceMetricsOverride here. It resizes the viewport under
// YouTube's lazy loader, whose IntersectionObserver then never fires, so no thumbnail image
// is ever downloaded (naturalWidth stays 0) and every capture is a grid of white boxes.
// Instead: a window larger than the shot, and capture a 1280x800 clip of it.

await cdp.send('Page.bringToFront', {}, page);

const results = [];
for (const [label, url, needsCards] of YOUTUBE_SURFACES) {
  await cdp.send('Page.navigate', { url }, page);
  let scored = 0;
  for (let i = 0; i < 22; i += 1) {
    await sleep(3000);
    // walk down and back so lazy-loaded thumbnails request their images, then return to the top
    await evaluate(page, 'scrollTo(0, 500)');
    await sleep(1500);
    await evaluate(page, 'scrollTo(0, 1000)');
    await sleep(1500);
    await evaluate(page, 'scrollTo(0, 0)');
    scored = await evaluate(page, `document.querySelectorAll('[data-ytvb-scored]').length`);
    if (scored >= 4) break;
  }
  // settle: let any in-flight batch paint before the shutter
  await sleep(4000);
  scored = await evaluate(page, `document.querySelectorAll('[data-ytvb-scored]').length`);

  // YouTube lazy-loads thumbnails; with a viewport override the IntersectionObserver never
  // fires, so without this the capture is a grid of blank white boxes. Force eager loading
  // and wait for real pixels, then assert it - a screenshot with empty thumbnails is worse
  // than no screenshot, because it makes a working extension look broken.
  let pending = 999;
  for (let i = 0; i < 12 && pending > 0; i += 1) {
    await evaluate(page, `(() => {
      for (const img of document.images) if (img.loading === 'lazy') img.loading = 'eager';
      return document.images.length;
    })()`);
    pending = await evaluate(page, `[...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length`);
    if (pending > 0) await sleep(1500);
  }
  // Measure the VISIBLE thumbnail: the largest <img> in each painted card. Counting every
  // img would be misleading, because YouTube parks tens of <img> elements that never get a
  // src attribute at all (naturalWidth 0), which is not the same as a blank thumbnail.
  const blank = await evaluate(page, `(() => {
    const W = ${W}, H = ${H};
    return [...document.querySelectorAll('[data-ytvb-scored]')].filter((a) => {
      const r = a.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) return false; // not in the shot
      const imgs = [...a.querySelectorAll('img')];
      if (!imgs.length) return true;
      const main = imgs.sort((x, y) => {
        const rx = x.getBoundingClientRect(), ry = y.getBoundingClientRect();
        return (ry.width * ry.height) - (rx.width * rx.height);
      })[0];
      return main.naturalWidth === 0;
    }).length;
  })()`);
  const cardsOk = needsCards ? scored > 0 && blank === 0 : true;
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } }, page);
  const file = path.join(OUT, `screenshot-${label}.png`);
  await writeFile(file, Buffer.from(shot.data, 'base64'));
  const buf = await readFile(file);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const ok = w === W && h === H && cardsOk;
  results.push({ label, file, dims: `${w}x${h}`, scored, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}  ${w}x${h}  scored=${scored}  blankThumbs=${blank}  ${(buf.length / 1024).toFixed(0)}KB`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
