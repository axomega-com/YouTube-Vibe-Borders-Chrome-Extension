export const CACHE_KEY = 'ytvb:cache';
export const MAX_ENTRIES = 2000;

/** Pure: keep only the newest `max` entries by `ts`. Does not mutate its input. */
export function evictOldest(entries, max = MAX_ENTRIES) {
  const pairs = Object.entries(entries ?? {});
  if (pairs.length <= max) return { ...(entries ?? {}) };
  pairs.sort((a, b) => (b[1]?.ts ?? 0) - (a[1]?.ts ?? 0));
  return Object.fromEntries(pairs.slice(0, max));
}

/** Wrap a chrome.storage-like area ({get,set,remove}) in a videoId -> score cache. */
export function makeCache(area, now = () => Date.now()) {
  const read = async () => (await area.get(CACHE_KEY))[CACHE_KEY] ?? {};
  return {
    async getMany(ids) {
      const all = await read();
      const hit = {};
      const miss = [];
      for (const id of ids ?? []) {
        if (all[id]) hit[id] = all[id];
        else miss.push(id);
      }
      return { hit, miss };
    },
    async putMany(scores) {
      const all = await read();
      const ts = now();
      for (const [id, score] of Object.entries(scores ?? {})) all[id] = { ...score, ts };
      await area.set({ [CACHE_KEY]: evictOldest(all) });
    },
    async clear() {
      await area.remove(CACHE_KEY);
    },
    async size() {
      return Object.keys(await read()).length;
    },
  };
}
