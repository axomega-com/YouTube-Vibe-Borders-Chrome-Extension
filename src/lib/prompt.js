// Pure prompt + response handling. No DOM, no chrome.* APIs. Unit-tested.
import { CATEGORIES } from './score.js';

export const BATCH_SIZE = 10;

const SYSTEM = `You are a literal, fast content classifier for YouTube videos.
Judge each video ONLY from its title and channel name. Never invent details.
For every video you must output three fields:
- positivity: integer 0-100. How uplifting, wholesome, useful or hopeful the video is for a typical viewer. 50 = neutral or purely informational.
- negativity: integer 0-100. How much conflict, fear, anger, distress, scandal or outrage the video trades in. 50 = neutral.
These two scales are INDEPENDENT. A video can score high on BOTH (an intense but ultimately uplifting comeback story) or low on both (a dry tutorial). Do not make one the inverse of the other.
- category: exactly one of ${CATEGORIES.join(' | ')}`;

export function buildPrompt(videos) {
  const listed = (videos ?? []).map((v, i) => ({
    i,
    title: String(v.title ?? '').slice(0, 200),
    channel: String(v.channel ?? '').slice(0, 80),
  }));
  return {
    system: SYSTEM,
    user: [
      'Classify every video in this JSON array.',
      JSON.stringify(listed),
      'Reply with ONLY minified JSON, no prose and no code fences, in exactly this shape:',
      '{"results":[{"i":0,"positivity":62,"negativity":18,"category":"Comedy"}]}',
    ].join('\n'),
  };
}

/**
 * API-boundary clamp: unusable numbers become NEUTRAL (50), not 0, because a
 * failed parse should read as "unknown", not as "totally calm".
 */
export function clampScore(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, n));
}

function stripFences(text) {
  return String(text ?? '')
    .replace(/^\s*```[a-zA-Z]*\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();
}

/** Returns a validated array of rows. Never throws. */
export function parseModelJson(text) {
  const raw = stripFences(text);
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed?.results) ? parsed.results : [];
  const out = [];
  for (const row of rows) {
    const i = Number(row?.i);
    if (!Number.isInteger(i) || i < 0) continue;
    out.push({
      i,
      positivity: clampScore(row?.positivity),
      negativity: clampScore(row?.negativity),
      category: CATEGORIES.includes(row?.category) ? row.category : 'Other',
    });
  }
  return out;
}

/** Map validated rows back onto the videos that were sent. */
export function mergeResults(videos, rows) {
  const byId = new Map();
  for (const row of rows ?? []) {
    const video = (videos ?? [])[row.i];
    if (!video?.videoId) continue;
    byId.set(video.videoId, {
      positivity: row.positivity,
      negativity: row.negativity,
      category: row.category,
    });
  }
  return byId;
}
