import { scoreToBorder, scoreLabel, formatBadge, scoreToFilter } from '../lib/score.js';
import { BADGE_CLASS, STYLE_ID } from '../lib/selectors.js';

const CSS = `
.${BADGE_CLASS} {
  position: absolute; left: 6px; bottom: 6px; z-index: 20;
  font: 600 11px/1.5 Roboto, Arial, sans-serif;
  color: #fff; background: rgba(0, 0, 0, .78);
  border-radius: 6px; padding: 2px 7px;
  pointer-events: none; letter-spacing: .2px; white-space: nowrap;
}
.${BADGE_CLASS}[data-label="Positive"] { color: #b6ffce; }
.${BADGE_CLASS}[data-label="Negative"] { color: #ffc2c2; }
`;

export function injectStyles(doc = document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const SCORED_KEYS = [
  'ytvbScored', 'ytvbPos', 'ytvbNeg', 'ytvbCategory', 'ytvbColor', 'ytvbLabel', 'ytvbFilter', 'ytvbTitle',
];

/**
 * Paint one thumbnail. `thumb` is the anchor wrapping the image (see findThumbAnchors) -
 * the same element on both YouTube layouts. Returns false if it has gone away.
 */
export function applyScore(thumb, score, meta = {}) {
  if (!thumb) return false;

  const { color, widthPx } = scoreToBorder(score);
  if (getComputedStyle(thumb).position === 'static') thumb.style.position = 'relative';

  // Grey + blur the image itself, never the wrapper: blurring the wrapper would smear
  // the outline and make the badge illegible. 'none' clears any previous value.
  const { css: filterCss } = scoreToFilter(score);
  for (const img of thumb.querySelectorAll('img')) {
    img.style.setProperty('filter', filterCss, 'important');
  }
  // setProperty with 'important' because YouTube ships aggressive thumbnail CSS.
  thumb.style.setProperty('outline', `${widthPx}px solid ${color}`, 'important');
  thumb.style.setProperty('outline-offset', '-2px', 'important');
  thumb.style.setProperty('border-radius', '12px', 'important');

  let badge = thumb.querySelector(`.${BADGE_CLASS}`);
  if (!badge) {
    badge = thumb.ownerDocument.createElement('div');
    badge.className = BADGE_CLASS;
    thumb.appendChild(badge);
  }
  const label = scoreLabel(score);
  badge.textContent = formatBadge(score);
  badge.dataset.label = label;

  thumb.dataset.ytvbScored = '1';
  thumb.dataset.ytvbPos = String(Math.round(Number(score.positivity) || 0));
  thumb.dataset.ytvbNeg = String(Math.round(Number(score.negativity) || 0));
  thumb.dataset.ytvbCategory = String(score.category ?? 'Other');
  thumb.dataset.ytvbColor = color;
  thumb.dataset.ytvbLabel = label;
  thumb.dataset.ytvbFilter = filterCss;
  thumb.dataset.ytvbTitle = String(meta.title ?? '').slice(0, 100);
  return true;
}

export function clearScore(thumb) {
  if (!thumb) return;
  thumb.style.removeProperty('outline');
  thumb.style.removeProperty('outline-offset');
  thumb.style.removeProperty('border-radius');
  for (const img of thumb.querySelectorAll('img')) img.style.removeProperty('filter');
  thumb.querySelector(`.${BADGE_CLASS}`)?.remove();
  for (const key of SCORED_KEYS) delete thumb.dataset[key];
  delete thumb.dataset.ytvbPending;
}
