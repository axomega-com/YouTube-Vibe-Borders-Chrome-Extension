# YouTube Vibe Borders

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
   `3 + 7*max(p,n)/100` px.

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
