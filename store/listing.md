# Chrome Web Store listing

Paste these into the Developer Dashboard. Character limits are enforced by the store.

## Name

```
Vibe Borders for YouTube
```

> **Name decided: `Vibe Borders for YouTube`.** Chosen over `YouTube Vibe Borders`, because
> leading with a Google trademark is the usual reason a listing is flagged for implying
> affiliation, and the store locks the published name permanently. The uploaded package's
> manifest name is what the store shows, so any future rename means rebuilding the zip.

## Short description (max 132 chars)

```
See how positive or negative a YouTube video is at a glance: every thumbnail gets a red-to-green border and a score badge.
```

## Detailed description

```
See the mood of YouTube before you click.

Vibe Borders reads the title and channel of each video on the page and asks an AI model to
score it twice: how positive the content is, and how negative. Every thumbnail is then
outlined on a red-to-green gradient - green for positive, red for negative - with a small
badge showing the category and both scores.

WHAT YOU GET

- A coloured border on every thumbnail: search results, the watch page sidebar, channel
  pages and feeds.
- A badge with the broad category (Music, News & Politics, Comedy, Gaming, Education and
  more) plus its positivity and negativity scores out of 100.
- Strongly negative thumbnails are greyed and blurred in proportion to how negative they
  are, so heavy content reads as calmer while you scroll.
- Scores are cached on your device, so scrolling back does not re-score the same video.

SET-UP TAKES A MINUTE

Scoring runs on a model you choose and you pay the model provider directly, so you need
your own OpenRouter API key - there is no server in the middle and no subscription.

1. Click the toolbar icon, then "Options".
2. Paste an OpenRouter API key from openrouter.ai/keys and press Save.
3. Open YouTube and scroll. Cards are scored shortly before they reach your screen.

The default model is typesafe/jev-router. Any OpenRouter model id works - put a cheaper one
in the Model id field if you are scoring a lot.

PRIVACY

Your API key stays in your browser. The only data that leaves it is the title and channel
name of the videos being scored, sent directly to OpenRouter using your own key. No
analytics, no tracking, no servers of ours. Scores are cached locally and can be cleared
from the popup at any time.

Not affiliated with, endorsed by, or sponsored by YouTube or Google.
