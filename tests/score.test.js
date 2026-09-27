import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreToBorder, scoreLabel, formatBadge, CATEGORIES } from '../src/lib/score.js';

test('pure positivity is thick full green', () => {
  assert.deepEqual(scoreToBorder({ positivity: 100, negativity: 0 }), { color: 'rgb(0,255,40)', widthPx: 10 });
});

test('pure negativity is thick full red', () => {
  assert.deepEqual(scoreToBorder({ positivity: 0, negativity: 100 }), { color: 'rgb(255,0,40)', widthPx: 10 });
});

test('intense-and-mixed is olive', () => {
  assert.deepEqual(scoreToBorder({ positivity: 50, negativity: 50 }), { color: 'rgb(128,128,40)', widthPx: 7 });
});

test('no signal is thin dark slate', () => {
  assert.deepEqual(scoreToBorder({ positivity: 0, negativity: 0 }), { color: 'rgb(0,0,40)', widthPx: 3 });
});

test('out-of-range and missing input clamp instead of throwing', () => {
  assert.equal(scoreToBorder({ positivity: 900, negativity: -50 }).color, 'rgb(0,255,40)');
  assert.equal(scoreToBorder({}).color, 'rgb(0,0,40)');
  assert.equal(scoreToBorder().color, 'rgb(0,0,40)');
  assert.equal(scoreToBorder({ positivity: 'x', negativity: null }).color, 'rgb(0,0,40)');
});

test('label boundaries', () => {
  assert.equal(scoreLabel({ positivity: 60, negativity: 10 }), 'Positive');
  assert.equal(scoreLabel({ positivity: 80, negativity: 70 }), 'Mixed', 'high both = mixed');
  assert.equal(scoreLabel({ positivity: 10, negativity: 65 }), 'Negative');
  assert.equal(scoreLabel({ positivity: 0, negativity: 0 }), 'Mixed');
});

test('badge shows category and both scores', () => {
  assert.equal(formatBadge({ positivity: 62.4, negativity: 18, category: 'Comedy' }), 'Comedy · +62 / -18');
  assert.equal(formatBadge({ positivity: 5, negativity: 5, category: 'Nonsense' }), 'Other · +5 / -5');
});

test('category list is the eleven agreed buckets', () => {
  assert.equal(CATEGORIES.length, 11);
  assert.ok(CATEGORIES.includes('Other'));
});
