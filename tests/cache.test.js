import test from 'node:test';
import assert from 'node:assert/strict';
import { evictOldest, makeCache, CACHE_KEY, MAX_ENTRIES } from '../src/lib/cache.js';

function fakeArea(seed = {}) {
  const store = { ...seed };
  return {
    store,
    async get(key) { return key in store ? { [key]: store[key] } : {}; },
    async set(obj) { Object.assign(store, obj); },
    async remove(key) { delete store[key]; },
  };
}

test('evictOldest keeps the newest N and does not mutate its input', () => {
  const input = { a: { ts: 1 }, b: { ts: 3 }, c: { ts: 2 } };
  const kept = evictOldest(input, 2);
  assert.deepEqual(Object.keys(kept).sort(), ['b', 'c']);
  assert.deepEqual(Object.keys(input).sort(), ['a', 'b', 'c'], 'input untouched');
});

test('evictOldest passes small maps straight through', () => {
  const kept = evictOldest({ a: { ts: 1 } }, 10);
  assert.deepEqual(kept, { a: { ts: 1 } });
});

test('getMany splits hits and misses', async () => {
  const area = fakeArea({ [CACHE_KEY]: { a: { positivity: 1, ts: 1 } } });
  const cache = makeCache(area);
  const { hit, miss } = await cache.getMany(['a', 'b']);
  assert.deepEqual(Object.keys(hit), ['a']);
  assert.deepEqual(miss, ['b']);
});

test('putMany stamps a timestamp and persists', async () => {
  const area = fakeArea();
  const cache = makeCache(area, () => 1234);
  await cache.putMany({ x: { positivity: 10, negativity: 20, category: 'Music' } });
  assert.deepEqual(area.store[CACHE_KEY].x, { positivity: 10, negativity: 20, category: 'Music', ts: 1234 });
});

test('putMany evicts beyond the cap', async () => {
  const area = fakeArea();
  const cache = makeCache(area, () => 0);
  const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`v${i}`, { positivity: i, ts: i }]));
  await cache.putMany(many);
  await cache.putMany({ newest: { positivity: 1 } });
  const size = await cache.size();
  assert.ok(size <= MAX_ENTRIES, `size ${size}`);
  assert.ok(size >= 1);
});

test('clear empties the namespace', async () => {
  const area = fakeArea({ [CACHE_KEY]: { a: { ts: 1 } } });
  const cache = makeCache(area);
  await cache.clear();
  assert.equal(await cache.size(), 0);
});
