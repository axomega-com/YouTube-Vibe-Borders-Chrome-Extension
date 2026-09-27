/**
 * Attaches to the user's REAL Chrome over CDP and does one thing, then exits.
 *
 * Matches what config.yaml already expects: browser.cdp_url=http://127.0.0.1:9222 with
 * browser.use_real_profile=true. Chrome must already be listening on that port:
 *
 *   cmd /c start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
 *     --remote-debugging-port=9222 ^
 *     --user-data-dir="C:\Users\<you>\AppData\Local\Google\Chrome\User Data" ^
 *     --profile-directory=Default --no-first-run --no-default-browser-check
 *
 * Chrome 136+ refuses remote debugging on the DEFAULT data dir, so --user-data-dir must be
 * passed explicitly even when it points at the normal location.
 *
 *   node tools/cws-drive.mjs dump            describe the active page (fields, buttons, text)
 *   node tools/cws-drive.mjs nav <url>       navigate the active tab
 *   node tools/cws-drive.mjs eval "<expr>"   evaluate JS, print the JSON result
 *   node tools/cws-drive.mjs shot <file>     screenshot the active tab
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';
const [cmd, arg] = process.argv.slice(2);

class Cdp {
  constructor(ws) {
    this.ws = ws; this.nextId = 0; this.pending = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
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

let version;
try {
  const res = await fetch(`${CDP_URL}/json/version`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  version = await res.json();
} catch (err) {
  console.log(`FAIL: nothing answering on ${CDP_URL} (${err.message})`);
  console.log('Chrome is not running with --remote-debugging-port. Launch it first.');
  process.exit(1);
}
console.log(`browser: ${version.Browser}`);

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
const cdp = new Cdp(ws);
await cdp.send('Target.setDiscoverTargets', { discover: true });

const { targetInfos } = await cdp.send('Target.getTargets');
const pages = targetInfos.filter((t) => t.type === 'page');
// Prefer a Web Store dashboard tab, else the active-looking page.
const page =
  pages.find((t) => /chrome\.google\.com\/.*webstore|webstore\/devconsole/.test(t.url)) ??
  pages.find((t) => t.url.startsWith('http')) ??
  pages[0];
if (!page) { console.log('FAIL: no page targets open'); process.exit(1); }
console.log(`page: ${page.title || '(untitled)'}  <${page.url}>`);

const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
await cdp.send('Runtime.enable', {}, sessionId);
await cdp.send('Page.enable', {}, sessionId);

const evaluate = async (expression, awaitPromise = true) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise, userGesture: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
await cdp.send('Page.bringToFront', {}, sessionId);

if (cmd === 'nav') {
  await cdp.send('Page.navigate', { url: arg }, sessionId);
  console.log(`navigating to ${arg}`);
  await new Promise((r) => setTimeout(r, 5000));
} else if (cmd === 'eval') {
  console.log(JSON.stringify(await evaluate(arg), null, 1));
} else if (cmd === 'shot') {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await mkdir(path.dirname(arg), { recursive: true });
  await writeFile(arg, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${arg}`);
} else if (cmd === 'dump') {
  const dump = await evaluate(`(() => {
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const label = (el) => clean(el.getAttribute('aria-label') || el.getAttribute('placeholder') ||
      (el.labels && el.labels[0] && el.labels[0].textContent) || el.name || el.id);
    return JSON.stringify({
      url: location.href,
      title: document.title,
      fields: [...document.querySelectorAll('input, textarea, select')].map((el) => ({
        tag: el.tagName.toLowerCase(), type: el.type, label: label(el).slice(0, 70),
        value: (el.value || '').slice(0, 60), id: el.id, name: el.name,
        required: el.required, disabled: el.disabled,
      })),
      buttons: [...document.querySelectorAll('button, [role="button"], a[role="button"]')]
        .map((el) => clean(el.textContent || el.getAttribute('aria-label')).slice(0, 60))
        .filter(Boolean),
      headings: [...document.querySelectorAll('h1, h2, h3')].map((el) => clean(el.textContent).slice(0, 90)).filter(Boolean),
      messages: [...document.querySelectorAll('[role="alert"], [class*="error" i], [class*="warning" i]')]
        .map((el) => clean(el.textContent).slice(0, 140)).filter(Boolean).slice(0, 12),
      text: clean(document.body.innerText).slice(0, 2500),
    }, null, 1);
  })()`);
  console.log(dump);
} else {
  console.log('usage: dump | nav <url> | eval "<expr>" | shot <file>');
}
process.exit(0);
