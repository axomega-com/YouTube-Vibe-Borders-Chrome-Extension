import { scoreToBorder, scoreLabel, formatBadge } from '../lib/score.js';
import { THUMB_SELECTOR, BADGE_CLASS, STYLE_ID } from '../lib/selectors.js';

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

const SCORED_KEYS = ['ytvbScored', 'ytvbPos', 'ytvbNeg', 'ytvbCategory', 'ytvbColor', 'ytvbLabel'];

/** Paint one card. Returns false when the card has no thumbnail (ad slots, skeletons). */
export function applyScore(card, score) {
  const thumb = card.querySelector(THUMB_SELECTOR);
  if (!thumb) return false;

  const { color, widthPx } = scoreToBorder(score);
  if (getComputedStyle(thumb).position === 'static') thumb.style.position = 'relative';
  // setProperty with 'important' because YouTube ships aggressive thumbnail CSS.
  thumb.style.setProperty('outline', `${widthPx}px solid ${color}`, 'important');
  thumb.style.setProperty('outline-offset', '-2px', 'important');
  thumb.style.setProperty('border-radius', '12px', 'important');

  let badge = thumb.querySelector(`.${BADGE_CLASS}`);
  if (!badge) {
    badge = card.ownerDocument.createElement('div');
    badge.className = BADGE_CLASS;
    thumb.appendChild(badge);
  }
  const label = scoreLabel(score);
  badge.textContent = formatBadge(score);
  badge.dataset.label = label;

  card.dataset.ytvbScored = '1';
  card.dataset.ytvbPos = String(Math.round(Number(score.positivity) || 0));
  card.dataset.ytvbNeg = String(Math.round(Number(score.negativity) || 0));
  card.dataset.ytvbCategory = String(score.category ?? 'Other');
  card.dataset.ytvbColor = color;
  card.dataset.ytvbLabel = label;
  return true;
}

export function clearScore(card) {
  const thumb = card.querySelector(THUMB_SELECTOR);
  if (thumb) {
    thumb.style.removeProperty('outline');
    thumb.style.removeProperty('outline-offset');
    thumb.style.removeProperty('border-radius');
    thumb.querySelector(`.${BADGE_CLASS}`)?.remove();
  }
  for (const key of SCORED_KEYS) delete card.dataset[key];
  delete card.dataset.ytvbPending;
}
