# Notes for the reviewer

Paste into "Notes for reviewer" in the dashboard. Reviewers must be able to see the
extension work, and this one needs an API key to do anything - so give them one.

```
HOW TO TEST

1. Open the extension's Options page (chrome://extensions -> Details -> Extension options).
2. Paste this OpenRouter API key and press Save:

   [PASTE A TEMPORARY OPENROUTER KEY HERE]

3. Visit https://www.youtube.com/results?search_query=news and scroll slowly.

EXPECTED RESULT

Within a few seconds of each card coming into view, its thumbnail gains a coloured border
(green = positive, red = negative, blending between), a small badge listing the category and
both scores, and strongly negative thumbnails grey and blur in proportion to that score.

NOTE

The extension requires the user's own OpenRouter API key, because scoring is billed to
whoever's key is used and there is no server of ours in the middle. The key above is a
throwaway, credit-limited key created for review. Please revoke or ignore it after testing.

The Model id field accepts any OpenRouter model id; the default is typesafe/jev-router.
Scoring happens just before a card reaches the viewport, so scrolling is required.
```

## Before you paste this

Mint a **throwaway, credit-limited** OpenRouter key for review. Do not reuse your own key:
it will sit in Google's review system, and a reviewer's browser traffic is not yours to
trust. Set a low credit limit on it, and revoke it after the listing is approved.
