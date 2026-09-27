# Permission justifications

The dashboard asks for a written reason for each permission. Paste these verbatim.

## `storage`

Stores the user's own OpenRouter API key and the model id they choose, plus a local cache
of scores keyed by video id so the same video is not re-scored on every page view. All of it
lives in chrome.storage.local on the user's device; none of it is transmitted anywhere.

## `scripting`

Used once, from `chrome.runtime.onInstalled`, to inject `content/bootstrap.js` into YouTube
tabs that were already open when the extension was installed or updated. Manifest-declared
content scripts are not applied to pre-existing tabs, so without this the extension appears
to do nothing until the user reloads every tab. The injection is guarded against running
twice.

## Host permission: `https://www.youtube.com/*`

Reads the video title and channel name from the page the user is already viewing, and draws
the border, badge, and thumbnail filter onto those page elements. Nothing is read from any
other site.

## Host permission: `https://openrouter.ai/*`

Sends the video titles and channel names to the OpenRouter API so the model the user
configured can score them. This is the only network request the extension makes.

## Remote code

The extension executes no remote code. All logic ships in the package; only JSON data is
exchanged with the API.
