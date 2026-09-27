import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, BATCH_SIZE, parseModelJson, clampScore, mergeResults } from '../src/lib/prompt.js';

const videos = [
  { videoId: 'aaaaaaaaaaa', title: 'Wholesome rescue dog reunion', channel: 'Happy Tails' },
  { videoId: 'bbbbbbbbbbb', title: 'Why everything is collapsing', channel: 'Doom Daily' },
];

test('batch size is ten', () => {
  assert.equal(BATCH_SIZE, 10);
});

test('prompt lists each video with an index, title and channel', () => {
  const { user } = buildPrompt(videos);
  assert.match(user, /"i":0/);
  assert.match(user, /Wholesome rescue dog reunion/);
  assert.match(user, /"i":1/);
  assert.match(user, /Doom Daily/);
});

test('prompt states that the two scales are independent', () => {
  const { system } = buildPrompt(videos);
  assert.match(system, /INDEPENDENT/);
  assert.match(system, /positivity/);
  assert.match(system, /negativity/);
});

test('system prompt enumerates every category', () => {
  const { system } = buildPrompt(videos);
  for (const c of ['News & Politics', 'Gaming', 'Other']) assert.ok(system.includes(c), c);
});

test('long titles are truncated and missing fields do not throw', () => {
  const { user } = buildPrompt([{ videoId: 'ccccccccccc', title: 'x'.repeat(500) }]);
  assert.equal(JSON.parse(user.split('\n')[1])[0].title.length, 200);
  assert.equal(JSON.parse(user.split('\n')[1])[0].channel, '');
});

test('parses clean minified JSON', () => {
  const rows = parseModelJson('{"results":[{"i":0,"positivity":70,"negativity":10,"category":"Music"}]}');
  assert.deepEqual(rows, [{ i: 0, positivity: 70, negativity: 10, category: 'Music' }]);
});

test('parses JSON wrapped in code fences and prose', () => {
  const text = 'Sure! Here you go:\n```json\n{"results":[{"i":1,"positivity":20,"negativity":90,"category":"News & Politics"}]}\n```\nHope that helps.';
  assert.deepEqual(parseModelJson(text), [{ i: 1, positivity: 20, negativity: 90, category: 'News & Politics' }]);
});

test('clamps out-of-range scores and maps unknown categories to Other', () => {
  const rows = parseModelJson('{"results":[{"i":0,"positivity":999,"negativity":-5,"category":"Yoga"}]}');
  assert.deepEqual(rows, [{ i: 0, positivity: 100, negativity: 0, category: 'Other' }]);
});

test('drops unusable rows instead of throwing', () => {
  const rows = parseModelJson('{"results":[{"positivity":50},{"i":"x"},{"i":0,"positivity":50,"negativity":50,"category":"Comedy"}]}');
  assert.deepEqual(rows, [{ i: 0, positivity: 50, negativity: 50, category: 'Comedy' }]);
});

test('garbage in produces an empty list, never an exception', () => {
  assert.deepEqual(parseModelJson('the model refused'), []);
  assert.deepEqual(parseModelJson(''), []);
  assert.deepEqual(parseModelJson(null), []);
  assert.deepEqual(parseModelJson('{"results":"nope"}'), []);
});

test('clampScore treats unusable numbers as neutral 50 at the API boundary', () => {
  assert.equal(clampScore('80'), 80);
  assert.equal(clampScore(80.6), 81);
  assert.equal(clampScore('nonsense'), 50);
  assert.equal(clampScore(undefined), 50);
  assert.equal(clampScore(-10), 0);
});

test('merges model rows onto the videos that were sent', () => {
  const sent = [
    { videoId: 'aaaaaaaaaaa', title: 'A', channel: 'x' },
    { videoId: 'bbbbbbbbbbb', title: 'B', channel: 'y' },
  ];
  const rows = [{ i: 1, positivity: 30, negativity: 70, category: 'Gaming' }];
  const merged = mergeResults(sent, rows);
  assert.equal(merged.size, 1);
  assert.deepEqual(merged.get('bbbbbbbbbbb'), { positivity: 30, negativity: 70, category: 'Gaming' });
});

test('ignores rows pointing outside the batch', () => {
  const merged = mergeResults([{ videoId: 'aaaaaaaaaaa' }], [{ i: 7, positivity: 1, negativity: 1, category: 'Other' }]);
  assert.equal(merged.size, 0);
});
