import test from 'node:test';
import assert from 'node:assert/strict';
import { videoIdFromHref, THUMB_ANCHOR_SELECTORS, TITLE_SELECTORS } from '../src/lib/selectors.js';

test('extracts ids from watch URLs', () => {
  assert.equal(videoIdFromHref('/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(videoIdFromHref('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'), 'dQw4w9WgXcQ');
  assert.equal(videoIdFromHref('/watch?list=PL123&v=dQw4w9WgXcQ&index=3'), 'dQw4w9WgXcQ');
});

test('extracts ids from shorts and live URLs', () => {
  assert.equal(videoIdFromHref('/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(videoIdFromHref('/live/dQw4w9WgXcQ?feature=share'), 'dQw4w9WgXcQ');
});

test('rejects anything that is not an 11 character id', () => {
  assert.equal(videoIdFromHref('/watch?v=tooshort'), null);
  assert.equal(videoIdFromHref('/watch?v=dQw4w9WgXcQextra'), null);
  assert.equal(videoIdFromHref('/feed/subscriptions'), null);
  assert.equal(videoIdFromHref(''), null);
  assert.equal(videoIdFromHref(undefined), null);
  assert.equal(videoIdFromHref({ href: '/watch?v=dQw4w9WgXcQ' }), null, 'must take a string');
});

test('thumbnail anchors cover every video URL shape', () => {
  for (const part of ['/watch?v=', '/shorts/', '/live/']) {
    assert.ok(THUMB_ANCHOR_SELECTORS.includes(part), part);
  }
});

test('title selectors cover BOTH YouTube layouts', () => {
  // Regression guard. The old ytd-* layout and the newer yt-lockup-view-model layout use
  // completely different title nodes, and dropping either silently kills a whole surface.
  assert.ok(TITLE_SELECTORS.some((s) => s.includes('ytLockupMetadataViewModelTitle')), 'new lockup layout');
  assert.ok(TITLE_SELECTORS.some((s) => s.includes('#video-title')), 'old ytd layout');
});

test('card wrappers are NOT hard-coded anywhere', () => {
  // The watch page had 0 ytd-compact-video-renderer elements while showing 4 thumbnails.
  // Discovery must be anchor-driven, so no ytd-* wrapper may leak back in.
  for (const sel of [THUMB_ANCHOR_SELECTORS, ...TITLE_SELECTORS]) {
    assert.ok(!sel.includes('ytd-rich-item-renderer'), sel);
    assert.ok(!sel.includes('ytd-compact-video-renderer'), sel);
  }
});
