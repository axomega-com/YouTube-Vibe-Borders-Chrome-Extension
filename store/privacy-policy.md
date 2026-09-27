# Privacy policy for Vibe Borders for YouTube

_Last updated: 27 September 2026_

Vibe Borders for YouTube ("the extension") is published by AXOmega
("we", "us"). This policy explains exactly what the extension does with your data.

## Short version

We do not collect anything. There is no server of ours, no analytics, and no tracking. The
only data that leaves your browser is the title and channel name of the YouTube videos being
scored, and it goes straight to the API provider whose key you supplied.

## What the extension stores, and where

Everything below is stored in your browser's extension storage, on your device. It is never
sent to us, because we have no server to send it to.

- **Your OpenRouter API key** - used to authenticate your own requests to OpenRouter.
- **Your chosen model id** - the OpenRouter model used for scoring.
- **A local cache of scores** - keyed by YouTube video id, so the same video is not scored
  repeatedly. Clear it any time with "Clear score cache" in the extension popup.

## What leaves your browser

When you view YouTube pages, the extension sends the **video title and channel name** of
each video being scored to the OpenRouter API (https://openrouter.ai/api/v1) using your own
API key. This is the only outbound request the extension makes.

It does **not** read, collect, or transmit:

- your name, email address, or Google or YouTube account details
- your browsing history, other open tabs, or any site other than youtube.com
- video contents, keystrokes, form input, or cookies
- passwords or any other credentials besides the API key you paste in

No advertising identifier, analytics event, or telemetry is generated. No data is sold or
shared with anyone other than OpenRouter, and only the data described above.

## Third-party service

Scoring is performed by OpenRouter. Data sent there is handled under OpenRouter's own
privacy policy: https://openrouter.ai/privacy

## Data retention and deletion

Scores are kept in your browser's local extension storage until you clear them. To remove
everything the extension has stored:

- open the extension popup and click **Clear score cache**, and
- remove the extension from `chrome://extensions`, which deletes its storage and your
  saved API key.

We hold no copy of any of it, so there is nothing for us to delete on your behalf.

## Children

The extension is not directed at children and collects no personal information from anyone.

## Changes

If this policy changes, the revised version will be published at this URL with an updated
date, and material changes will be noted in the extension's store listing.

## Contact

support@axomega.com
