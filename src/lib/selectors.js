// The single source of truth for YouTube's DOM. When YouTube changes markup,
// fix it here and nowhere else.
export const CARD_SELECTORS = [
  'ytd-rich-item-renderer', // home / subscriptions feed
  'ytd-video-renderer', // search results
  'ytd-grid-video-renderer', // channel + playlist grids
  'ytd-compact-video-renderer', // watch-page sidebar
];

export const THUMB_SELECTOR = 'a#thumbnail, #thumbnail, ytd-thumbnail';
export const TITLE_SELECTOR = '#video-title, a#video-title-link, #video-title-link';
export const CHANNEL_SELECTOR = 'ytd-channel-name #text, #channel-name a, ytd-channel-name a';
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

export function findCards(root = document) {
  return CARD_SELECTORS.flatMap((sel) => Array.from(root.querySelectorAll(sel)));
}

/** {videoId, title, channel} or null when the card has no usable link/title. */
export function extractMeta(card) {
  const link = card.querySelector('a#thumbnail[href], a#video-title-link[href], a#video-title[href]');
  const videoId = videoIdFromHref(link?.getAttribute('href') ?? '');
  if (!videoId) return null;
  const titleEl = card.querySelector(TITLE_SELECTOR);
  const title = (titleEl?.getAttribute('title') || titleEl?.textContent || '').trim();
  if (!title) return null;
  const channel = (card.querySelector(CHANNEL_SELECTOR)?.textContent || '').trim();
  return { videoId, title, channel };
}
