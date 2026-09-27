# Vibe Borders for YouTube

Draws a red-to-green gradient border around YouTube thumbnails, coloured by two
AI-assigned 0-100 scores: green channel = positivity, red channel = negativity.
Border thickness grows with whichever score is stronger.

Not affiliated with YouTube. Video titles are sent to OpenRouter for scoring.

## How it works

1. `src/content/bootstrap.js` (classic content script) dynamically imports
   `content/main.js` from `web_accessible_resources` -- content scripts cannot use
   static ESM imports.
2. `main.js` finds video cards near the viewport, extracts `{videoId, title, channel}`,
   and asks the service worker to score batches of 10.
3. The worker checks `chrome.storage.local` first, calls OpenRouter for the misses,
   parses strict JSON, and caches each `videoId` for good.
4. `overlay.js` outlines each thumbnail:
   `rgb(255*negativity/100, 255*positivity/100, 40)`, thickness
   `3 + 7*max(p,n)/100` px, and greys + blurs the image itself in proportion to
   negativity (`80% negative -> grayscale(0.8) blur(3.2px)`), capped by
   `MAX_BLUR_PX = 4` in `src/lib/score.js`.

## Dev

    npm test                       # unit tests, no network, no browser
    node tools/set-key.mjs         # optional: dev-only key fallback from .env
    npm run smoke                  # one real OpenRouter call
    npm run e2e                    # launches Chrome for Testing + screenshots

Chrome for Testing is required for the automated run: branded Chrome (stable and
Canary) ignores `--load-extension`. `tools/chrome-path.mjs` finds one, preferring
`$YTVB_CHROME`, then the Playwright cache, then the puppeteer cache.

## Install

chrome://extensions -> Developer mode -> Load unpacked -> select the `src` folder

Works in Chrome stable and Canary. The automated test run cannot use those, because
branded Chrome ignores `--load-extension`; it uses a Chrome for Testing binary instead.

### Where the API key lives

`chrome.storage.local`, set once through the extension's own Options page. That is the only
source: the service worker reads it on every request. There is deliberately no file-based
fallback, because dynamic `import()` is disallowed inside service workers
(w3c/ServiceWorker#1356), so any such attempt fails invisibly. `tools/set-key.mjs` writes a
key file for the **Node tools** (`npm run smoke`, `npm run e2e`) only.

## Verified behaviour

Results from the real runs on this machine, not guesses:

* `npm test` -- 31 assertions, 0 failures, no network and no browser.
* `npm run smoke` -- HTTP 200 from `typesafe/jev-router`, 3/3 videos scored, and the
  scores are sensible (rescue puppy +92, housing-market collapse +8 / -88, a Rust
  tutorial +50 / -2).
* `npm run e2e` against a `search_query=news` page -- 21 of 21 cards on the page
  outlined, colour spanning `rgb(230,26,40)` (a fatal explosion story) through
  `rgb(128,128,40)` (neutral headlines) to `rgb(51,204,40)` (a dog rescue).
* Screenshots land in `out/`.

### Host-specific notes

* **`npm test` uses an explicit glob.** On Node 26, `node --test tests/` tries to load
  the directory as a module and dies with `Cannot find module ...\tests`. Use
  `node --test "tests/**/*.test.js"`.
* **The extension id changes whenever `.chrome-profile` is deleted.** Unpacked
  extensions get a key generated into the profile, so never hard-code the id. The e2e
  harness finds our worker by checking `chrome.runtime.getManifest().name`, because a
  fresh CfT profile also runs a built-in "Google Hangouts" service worker that will
  happily accept an injected key and do nothing with it.

### YouTube serves two different layouts (read this before touching selectors)

The same markup does not exist everywhere. Measured on two surfaces in one session:

| Surface | Card element | Thumbnail anchor | Title node |
| --- | --- | --- | --- |
| Search results | `ytd-video-renderer` | `a#thumbnail` | `a#video-title` |
| Watch sidebar, channel pages, feeds | `yt-lockup-view-model` | `a.ytLockupViewModelContentImage` | `a.ytLockupMetadataViewModelTitle` |

On a watch page showing four thumbnails, `ytd-compact-video-renderer` matched **0**
elements. Hard-coded card wrappers therefore rot silently: search kept working while the
watch page, channel pages and feeds painted nothing at all.

Discovery is **anchor-driven** instead: find `a[href*="/watch?v="]` (or `/shorts/`,
`/live/`) that actually contains an `img`, read the video id from the href, then climb to
the smallest ancestor that also contains a title node. That container is the card, on
either layout. To re-check after a YouTube change:

    node tools/probe-dom.mjs     # dumps card types, anchors, titles and images per surface

### Publishing to the Chrome Web Store

`bash tools/build-zip.sh` produces `out/youtube-vibe-borders-<version>.zip` from git-tracked
files only, and refuses to emit a package that the store would reject: manifest not at the
zip root, missing 128px icon, a `key` field, a dirty `src/` that would not match HEAD, or the
dev API key. Screenshots at exactly 1280x800 come from `node tools/store-assets.mjs`, icons
from `node tools/make-icons.mjs` (regeneratable, no dependencies).

The upload text - listing copy, permission justifications, reviewer notes, privacy policy
(markdown and a hostable HTML page) and the dashboard walkthrough - lives in `store/`. Start
with `store/checklist.md`.

### Diagnosing "nothing happens"

The popup reports **This tab: N of M thumbnails scored**. If it says *not running*, the
content script is not in that tab - reload the tab, or press **Inject into open YouTube
tabs**. Manifest-registered content scripts never appear in tabs that were already open
when the extension was installed, so the service worker also injects into them from
`onInstalled`; `content/bootstrap.js` guards against a double `start()`.

`node tools/verify-inject.mjs` proves that path: it seeds the key, scores a watch page,
re-runs the injection, and asserts no card ends up with two badges.
