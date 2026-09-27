import { buildPrompt, parseModelJson, mergeResults } from '../src/lib/prompt.js';

const ENV_PATH = process.env.YTVB_ENV || 'C:/Users/nz_jo/AppData/Local/hermes/profiles/axomega-biz-bot/.env';
const MODEL = process.env.YTVB_MODEL || 'typesafe/jev-router';

async function key() {
  try {
    const { DEV_API_KEY } = await import('../src/config.local.js');
    if (DEV_API_KEY) return DEV_API_KEY;
  } catch {}
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(ENV_PATH, 'utf8');
  const match = text.match(/^\s*OPENROUTER_API_KEY\s*=\s*"?([^"#\r\n]+)"?\s*$/m);
  if (!match) throw new Error('no key found; run node tools/set-key.mjs first');
  return match[1].trim();
}

const videos = [
  { videoId: 'aaaaaaaaaaa', title: 'Rescue puppy sees the ocean for the first time', channel: 'Happy Tails' },
  { videoId: 'bbbbbbbbbbb', title: 'The collapse of the housing market is accelerating', channel: 'Finance Fear' },
  { videoId: 'ccccccccccc', title: 'Rust ownership explained in 10 minutes', channel: 'Systems Weekly' },
];

const { system, user } = buildPrompt(videos);
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await key()}`,
    'X-Title': 'Vibe Borders for YouTube smoke test',
  },
  body: JSON.stringify({
    model: MODEL,
    temperature: 0,
    max_tokens: 700,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }),
});

console.log('HTTP', res.status, 'model requested:', MODEL);
if (!res.ok) {
  console.log((await res.text()).slice(0, 500));
  process.exit(1);
}

const json = await res.json();
const content = json?.choices?.[0]?.message?.content ?? '';
console.log('served by:', json?.model, '| usage:', JSON.stringify(json?.usage));
console.log('--- raw content (first 400 chars) ---');
console.log(content.slice(0, 400));

const merged = mergeResults(videos, parseModelJson(content));
console.log('--- parsed ---');
for (const v of videos) {
  const s = merged.get(v.videoId);
  console.log(s ? `${s.category.padEnd(20)} +${s.positivity} / -${s.negativity}  ${v.title}` : `UNPARSED  ${v.title}`);
}
if (merged.size !== videos.length) {
  console.error('FAIL: not every video was scored');
  process.exit(1);
}
console.log('OK: all', merged.size, 'videos scored');
