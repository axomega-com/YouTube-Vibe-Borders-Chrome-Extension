import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { findChrome, LAUNCH_FLAGS } from './chrome-path.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROFILE = path.join(ROOT, '.chrome-profile');
const OUT = path.join(ROOT, 'out');
const EXT = process.env.E2E_EXT_DIR || path.join(ROOT, 'src');
// Print it: an env var typo here silently tests src/ while you believe you tested the
// shipped package. That has already bitten this project once.
console.log('extension dir:', EXT);
const PORT = Number(process.env.CDP_PORT || 9333);
const EXTENSION_NAME = 'YouTube Vibe Borders';
const URL_UNDER_TEST =
  process.env.TARGET_URL || 'https://www.youtube.com/results?search_query=good+news+stories&hl=en&gl=US';
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS || 180000);

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.handlers.get(msg.method) ?? []) fn(msg.params, msg.sessionId);
      }
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
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

/**
 * Find OUR extension's service worker.
 *
 * Do NOT take the first chrome-extension:// service worker: Chrome for Testing ships
 * built-in component extensions (e.g. "Google Hangouts") that run one too, and injecting
 * a key into those silently does nothing. Match our own manifest name instead, and retry
 * because chrome.* is briefly unbound right after the worker starts.
 */
async function findOurWorker(cdp) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const workers = targetInfos.filter((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
    for (const worker of workers) {
      let sessionId;
      try {
        ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId: worker.targetId, flatten: true }));
        await cdp.send('Runtime.enable', {}, sessionId);
        const res = await cdp.send(
          'Runtime.evaluate',
          {
            expression: 'chrome.runtime && chrome.runtime.getManifest && chrome.runtime.getManifest().name',
            returnByValue: true,
          },
          sessionId,
        );
        if (res.result?.value === EXTENSION_NAME) return { id: new URL(worker.url).host, sessionId, url: worker.url };
      } catch {}
      if (sessionId) await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
    }
    await sleep(1000);
  }
  throw new Error(
    `no service worker reporting the name "${EXTENSION_NAME}": --load-extension was probably ignored ` +
      '(use Chrome for Testing, not branded Chrome or Canary)',
  );
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

  // --- 1. locate our extension by name
  const worker = await findOurWorker(cdp);
  console.log('extension id:', worker.id);
  cdp.on('Runtime.consoleAPICalled', (p, s) => {
    if (s === worker.sessionId) console.log('[SW]', p.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
  });

  // --- 2. inject the API key straight into extension storage (no page needed)
  let apiKey = process.env.YTVB_API_KEY;
  if (!apiKey) {
    try {
      // The dev key belongs to the HARNESS, not to the artifact under test: when E2E_EXT_DIR
      // points at a packaged copy, that copy rightly contains no config.local.js.
      const text = await readFile(path.join(ROOT, 'src', 'config.local.js'), 'utf8');
      apiKey = text.match(/DEV_API_KEY\s*=\s*"([^"]+)"/)?.[1];
    } catch {}
  }
  if (process.env.YTVB_NO_INJECT === '1') {
    console.log('key injection skipped (YTVB_NO_INJECT=1): the extension must find the key itself');
  } else {
    if (!apiKey) throw new Error('no API key: run `node tools/set-key.mjs` or set YTVB_API_KEY');
    const injected = await cdp.send(
      'Runtime.evaluate',
      {
        expression: `chrome.storage.local.set({ apiKey: ${JSON.stringify(apiKey)} }).then(() => 'stored ' + ${apiKey.length})`,
        awaitPromise: true,
        returnByValue: true,
      },
      worker.sessionId,
    );
    if (!String(injected.result?.value ?? '').startsWith('stored')) {
      throw new Error('key injection failed: ' + JSON.stringify(injected.exceptionDetails ?? injected.result));
    }
    console.log('key injection:', injected.result.value);
  }

  // --- 3. open the page under test
  const { targetId: pageId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: page } = await cdp.send('Target.attachToTarget', { targetId: pageId, flatten: true });
  cdp.on('Runtime.consoleAPICalled', (p, s) => {
    if (s === page) console.log('[page]', p.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
  });
  await cdp.send('Runtime.enable', {}, page);
  await cdp.send('Page.enable', {}, page);
  await cdp.send('Network.enable', {}, page);
  // Skip the consent interstitial.
  await cdp.send('Network.setCookie', { name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/', secure: true }, page);
  await cdp.send('Page.navigate', { url: URL_UNDER_TEST }, page);
  console.log('navigated to', URL_UNDER_TEST);

  // --- 4. wait for the first paint, then scroll so lazy-rendered cards get scored too
  const evaluate = async (expression) =>
    (await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, page)).result?.value;
  const scoredCount = async () => (await evaluate(`document.querySelectorAll('[data-ytvb-scored]').length`)) ?? 0;

  const started = Date.now();
  const deadline = started + TIMEOUT_MS;
  let count = 0;
  while (Date.now() < deadline && count === 0) {
    count = await scoredCount();
    if (count === 0) await sleep(2000);
  }
  console.log(`first paint after ${Math.round((Date.now() - started) / 1000)}s`);

  for (const y of [1200, 2600, 4200]) {
    await evaluate(`scrollTo(0, ${y})`);
    await sleep(9000);
  }
  await evaluate('scrollTo(0, 0)');
  await sleep(3000);
  count = await scoredCount();

  const CARD_TOTAL = `[...document.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"], a[href*="/live/"]')].filter((a) => a.querySelector('img')).length`;
  console.log(`cards on page: ${await evaluate(CARD_TOTAL)} | scored: ${count}`);

  // Always report the page state: without this a failure says only "nothing happened",
  // which is useless when the cause is a consent wall, a bot check or an unexpected layout.
  const state = await evaluate(`JSON.stringify({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    bodyText: (document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220),
    contentScriptRan: Boolean(document.getElementById('ytvb-styles')),
    noKeyBanner: Boolean(document.getElementById('ytvb-banner')),
    counts: {
      ytdRichItem: document.querySelectorAll('ytd-rich-item-renderer').length,
      ytdVideo: document.querySelectorAll('ytd-video-renderer').length,
      ytdGridVideo: document.querySelectorAll('ytd-grid-video-renderer').length,
      ytdCompact: document.querySelectorAll('ytd-compact-video-renderer').length,
      richGridMedia: document.querySelectorAll('ytd-rich-grid-media').length,
      thumbAnchorsWithImg: [...document.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"], a[href*="/live/"]')].filter((a) => a.querySelector('img')).length,
      watchLinks: document.querySelectorAll('a[href*="watch?v="]').length,
      totalElements: document.querySelectorAll('*').length,
    },
  })`);
  console.log('page state:', state);

  const { result: dump } = await cdp.send(
    'Runtime.evaluate',
    {
      expression: `JSON.stringify([...document.querySelectorAll('[data-ytvb-scored]')].map((c) => ({
        title: (c.dataset.ytvbTitle || '').slice(0, 50),
        p: Number(c.dataset.ytvbPos), n: Number(c.dataset.ytvbNeg),
        cat: c.dataset.ytvbCategory, color: c.dataset.ytvbColor, label: c.dataset.ytvbLabel,
        filter: c.dataset.ytvbFilter,
        imgFilter: (() => { const i = c.querySelector('img'); return i ? getComputedStyle(i).filter : '(no img)'; })(),
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

  // The filter must be proportional to the reported negativity, and must have actually
  // landed on the <img> (getComputedStyle), not just in a data attribute.
  const filterOk = (r) => {
    if (r.n === 0) return r.filter === 'none' && r.imgFilter === 'none';
    const m = /^grayscale\(([\d.]+)\) blur\(([\d.]+)px\)$/.exec(r.filter || '');
    if (!m) return false;
    return (
      Math.abs(Number(m[1]) - r.n / 100) < 0.011 &&
      Math.abs(Number(m[2]) - (r.n / 100) * 4) < 0.05 &&
      String(r.imgFilter).startsWith('grayscale(')
    );
  };

  const valid =
    scored.length > 0 &&
    scored.every(
      (r) =>
        Number.isInteger(r.p) && r.p >= 0 && r.p <= 100 &&
        Number.isInteger(r.n) && r.n >= 0 && r.n <= 100 &&
        typeof r.cat === 'string' && r.cat.length > 0 &&
        /^rgb\(\d+,\d+,40\)$/.test(r.color || '') &&
        ['Positive', 'Negative', 'Mixed'].includes(r.label) &&
        filterOk(r),
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
