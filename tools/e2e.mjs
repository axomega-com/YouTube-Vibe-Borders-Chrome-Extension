import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { findChrome, LAUNCH_FLAGS } from './chrome-path.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROFILE = path.join(ROOT, '.chrome-profile');
const OUT = path.join(ROOT, 'out');
const EXT = path.join(ROOT, 'src');
const PORT = Number(process.env.CDP_PORT || 9333);
const URL_UNDER_TEST =
  process.env.TARGET_URL || 'https://www.youtube.com/results?search_query=good+news+stories&hl=en&gl=US';
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS || 180000);

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevTools() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('DevTools endpoint never came up on port ' + PORT);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await rm(PROFILE, { recursive: true, force: true });

  const chromePath = findChrome();
  console.log('chrome:', chromePath);
  const chrome = spawn(
    chromePath,
    [
      `--user-data-dir=${PROFILE}`,
      `--load-extension=${EXT}`,
      `--disable-extensions-except=${EXT}`,
      `--remote-debugging-port=${PORT}`,
      ...LAUNCH_FLAGS, // --no-sandbox --disable-gpu --remote-allow-origins=*
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,OptimizationHints',
      '--window-size=1400,1000',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const shutdown = () => {
    try {
      chrome.kill();
    } catch {}
  };
  process.on('exit', shutdown);

  const wsUrl = await waitForDevTools();
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send('Target.setDiscoverTargets', { discover: true });

  // 1. Find the extension id from its service worker target.
  let extId = null;
  for (let i = 0; i < 30 && !extId; i += 1) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
    if (sw) extId = new URL(sw.url).host;
    else await sleep(500);
  }
  if (!extId) {
    throw new Error(
      'extension service worker never appeared: --load-extension was ignored (are you using Chrome for Testing?)',
    );
  }
  console.log('extension id:', extId);

  // 2. Inject the API key into chrome.storage from an extension page.
  let apiKey = process.env.YTVB_API_KEY;
  if (!apiKey) {
    try {
      const text = await readFile(path.join(EXT, 'config.local.js'), 'utf8');
      apiKey = text.match(/DEV_API_KEY\s*=\s*"([^"]+)"/)?.[1];
    } catch {}
  }
  if (apiKey) {
    const { targetId } = await cdp.send('Target.createTarget', {
      url: `chrome-extension://${extId}/options/options.html`,
    });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    const result = await cdp.send(
      'Runtime.evaluate',
      {
        expression: `chrome.storage.local.set({ apiKey: ${JSON.stringify(apiKey)} }).then(() => 'key-set')`,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    console.log('key injection:', result.result?.value);
    await cdp.send('Target.closeTarget', { targetId });
  } else {
    console.log('WARNING: no API key available; run `node tools/set-key.mjs` first');
  }

  // 3. Open the page under test.
  const { targetId: pageId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: page } = await cdp.send('Target.attachToTarget', { targetId: pageId, flatten: true });
  await cdp.send('Page.enable', {}, page);
  await cdp.send('Network.enable', {}, page);
  // Skip the consent interstitial.
  await cdp.send('Network.setCookie', { name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/', secure: true }, page);
  await cdp.send('Page.navigate', { url: URL_UNDER_TEST }, page);
  console.log('navigated to', URL_UNDER_TEST);

  // 4. Poll for painted cards.
  const deadline = Date.now() + TIMEOUT_MS;
  let count = 0;
  while (Date.now() < deadline) {
    const { result } = await cdp.send(
      'Runtime.evaluate',
      { expression: `document.querySelectorAll('[data-ytvb-scored]').length`, returnByValue: true },
      page,
    );
    count = result.value ?? 0;
    if (count > 0) break;
    await sleep(2000);
  }

  const { result: dump } = await cdp.send(
    'Runtime.evaluate',
    {
      expression: `JSON.stringify([...document.querySelectorAll('[data-ytvb-scored]')].map((c) => ({
        title: (c.querySelector('#video-title')?.textContent || '').trim().slice(0, 60),
        p: Number(c.dataset.ytvbPos), n: Number(c.dataset.ytvbNeg),
        cat: c.dataset.ytvbCategory, color: c.dataset.ytvbColor, label: c.dataset.ytvbLabel,
      })))`,
      returnByValue: true,
    },
    page,
  );

  const screenshotPath = path.join(OUT, `e2e-${Date.now()}.png`);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, page);
  await writeFile(screenshotPath, Buffer.from(data, 'base64'));

  const scored = JSON.parse(dump.value || '[]');
  console.log(`overlays painted: ${count}`);
  console.table(scored);

  const valid =
    scored.length > 0 &&
    scored.every(
      (r) =>
        Number.isInteger(r.p) && r.p >= 0 && r.p <= 100 &&
        Number.isInteger(r.n) && r.n >= 0 && r.n <= 100 &&
        typeof r.cat === 'string' && r.cat.length > 0 &&
        /^rgb\(\d+,\d+,40\)$/.test(r.color || ''),
    );

  console.log('screenshot:', screenshotPath);
  ws.close();
  shutdown();

  if (!valid) {
    console.error('FAIL: no valid painted overlays');
    process.exit(1);
  }
  const avg = (key) => Math.round(scored.reduce((a, r) => a + r[key], 0) / scored.length);
  console.log(`OK overlays=${scored.length} avg_positivity=${avg('p')} avg_negativity=${avg('n')}`);
  console.log('MEDIA:' + screenshotPath);
}

await main();
