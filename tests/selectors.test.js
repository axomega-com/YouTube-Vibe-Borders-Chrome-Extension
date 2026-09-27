import test from 'node:test';
import assert from 'node:assert/strict';
import { videoIdFromHref, CARD_SELECTORS } from '../src/lib/selectors.js';

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

test('covers the four card kinds', () => {
  assert.deepEqual(CARD_SELECTORS, [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-compact-video-renderer',
  ]);
});
