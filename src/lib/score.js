// Pure score -> styling math. No DOM, no chrome.* APIs. Unit-tested.
export const CATEGORIES = [
  'News & Politics',
  'Entertainment',
  'Music',
  'Gaming',
  'Education & Science',
  'Technology',
  'Sports',
  'Lifestyle & Vlog',
  'Finance & Business',
  'Comedy',
  'Other',
];

const BLUE_FLOOR = 40; // constant blue so a 0/0 video is dark slate, not invisible

/** Render-boundary clamp: unusable numbers become 0 (no colour), never NaN. */
function pct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n)) / 100;
}

/** Map {positivity, negativity} in 0-100 to an outline colour + width. */
export function scoreToBorder({ positivity, negativity } = {}) {
  const p = pct(positivity);
  const n = pct(negativity);
  const r = Math.round(255 * n); // red   <- negativity
  const g = Math.round(255 * p); // green <- positivity
  const widthPx = 3 + Math.round(7 * Math.max(p, n)); // 3..10px
  return { color: `rgb(${r},${g},${BLUE_FLOOR})`, widthPx };
}

export function scoreLabel({ positivity, negativity } = {}) {
  const p = Number(positivity) || 0;
  const n = Number(negativity) || 0;
  if (p >= 60 && p - n >= 15) return 'Positive';
  if (n >= 60 && n - p >= 15) return 'Negative';
  return 'Mixed';
}

export function formatBadge(score = {}) {
  const p = Math.round(pct(score.positivity) * 100);
  const n = Math.round(pct(score.negativity) * 100);
  const category = CATEGORIES.includes(score.category) ? score.category : 'Other';
  return `${category} · +${p} / -${n}`;
}
