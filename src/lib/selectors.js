// The single source of truth for YouTube's DOM.
//
// YouTube renders list surfaces with TWO component families:
//   - the older ytd-* renderers (search results):      a#thumbnail      + a#video-title
//   - the newer yt-lockup-view-model set (watch sidebar, channel pages, feeds):
//     a.ytLockupViewModelContentImage + a.ytLockupMetadataViewModelTitle
// Card-wrapper selectors rot: `ytd-compact-video-renderer` matched 0 elements on a watch
// page that was displaying four thumbnails. So discovery is ANCHOR-DRIVEN - find the
// thumbnail first, then walk outwards to the card that owns it.
export const THUMB_ANCHOR_SELECTORS = 'a[href*="/watch?v="], a[href*="/shorts/"], a[href*="/live/"]';

/** Known title nodes, old layout and new. Used to locate the CARD, never as a card selector. */
export const TITLE_SELECTORS = [
  'a.ytLockupMetadataViewModelTitle',
  'a#video-title',
  'a#video-title-link',
  '#video-title',
];
const TITLE_SELECTOR = TITLE_SELECTORS.join(', ');
const CARD_CLIMB_LIMIT = 8;
export const BADGE_CLASS = 'ytvb-badge';
export const STYLE_ID = 'ytvb-styles';
export const BANNER_ID = 'ytvb-banner';

const ID_RE = /(?:[?&]v=|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;

/** Pure. Returns an 11-char videoId or null. Never throws. */
export function videoIdFromHref(href) {
  if (typeof href !== 'string') return null;
  const match = href.match(ID_RE);
  return match ? match[1] : null;
}

const squeeze = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/** Every anchor holding a real thumbnail image. Avatars and plain text links are excluded. */
export function findThumbAnchors(root = document) {
  return Array.from(root.querySelectorAll(THUMB_ANCHOR_SELECTORS)).filter((a) => a.querySelector('img'));
}

/** The smallest ancestor that also contains a title node: the card that owns this thumbnail. */
export function findCard(anchor, limit = CARD_CLIMB_LIMIT) {
  let node = anchor.parentElement;
  for (let i = 0; node && i < limit; i += 1, node = node.parentElement) {
    if (node.querySelector(TITLE_SELECTOR)) return node;
  }
  return anchor.parentElement ?? anchor;
}

/**
 * The lockup layout has no channel link, so fall back to the first line of its metadata
 * block. An empty channel is acceptable: the prompt treats it as an optional hint.
 */
function channelOf(card) {
  const link = card.querySelector('a[href^="/@"], a[href*="/channel/"]');
  const fromLink = squeeze(link?.textContent);
  if (fromLink) return fromLink.slice(0, 80);
  const meta = card.querySelector('yt-content-metadata-view-model');
  if (!meta) return '';
  const first = [...meta.querySelectorAll('span, yt-formatted-string')].map((el) => squeeze(el.textContent)).find(Boolean);
  return (first ?? '').slice(0, 80);
}

/** {videoId, title, channel, thumb} for a thumbnail anchor, or null if unusable. */
export function extractMeta(anchor, card = findCard(anchor)) {
  const videoId = videoIdFromHref(anchor.getAttribute('href') ?? '');
  if (!videoId) return null;
  const titleEl = card.querySelector(TITLE_SELECTOR);
  const title = squeeze(titleEl?.getAttribute('title')) || squeeze(titleEl?.textContent);
  if (!title) return null;
  return { videoId, title, channel: channelOf(card), thumb: anchor };
}
