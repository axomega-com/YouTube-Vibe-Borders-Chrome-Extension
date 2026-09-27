import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const MS_PLAYWRIGHT = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
const PUPPETEER_CACHE = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');

/** Newest chrome.exe inside a directory of `prefix-<version>/chrome-win64/` folders. */
function newestMatch(dir, prefix) {
  if (!existsSync(dir)) return null;
  const versions = readdirSync(dir).filter((d) => d.startsWith(prefix)).sort();
  for (const version of versions.reverse()) {
    const exe = path.join(dir, version, 'chrome-win64', 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  return null;
}

/**
 * Chrome for Testing is REQUIRED: branded Chrome (stable, Canary) ignores
 * --load-extension. Playwright's `chromium-*` cache dir holds a CfT build on
 * this host (verified: ProductName "Google Chrome for Testing"), so it goes first.
 * Order: $YTVB_CHROME -> Playwright CfT -> puppeteer CfT -> branded Chrome.
 */
export function findChrome() {
  if (process.env.YTVB_CHROME) return process.env.YTVB_CHROME;
  const playwright = newestMatch(MS_PLAYWRIGHT, 'chromium-');
  if (playwright) return playwright;
  const puppeteer = newestMatch(PUPPETEER_CACHE, 'win64-');
  if (puppeteer) return puppeteer;
  const branded = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (existsSync(branded)) {
    console.warn('[ytvb] falling back to branded Chrome: --load-extension will be IGNORED, load unpacked manually');
    return branded;
  }
  throw new Error('No Chrome binary found. Set YTVB_CHROME=C:/path/to/chrome.exe');
}

/**
 * Launch flags shared by every command in this repo.
 * --no-sandbox is not optional on this host: the CfT build reports
 * "Sandbox cannot access executable ... Access is denied" without it.
 */
export const LAUNCH_FLAGS = ['--no-sandbox', '--disable-gpu', '--remote-allow-origins=*'];

// Lets the shell do: CHROME=$(node tools/chrome-path.mjs)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(findChrome());
}
