import test from 'node:test';
import assert from 'node:assert/strict';
import { viewportLayout, clampZoom } from '../src/forum/mapViewport.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `Expected ${actual} close to ${expected}`);

test('fits landscape image inside bounded 600x460 viewport at 100%', () => {
  const x = viewportLayout(2400, 1200, 600, 460);
  assert.equal(x.ready, true);
  near(x.width, 600);
  near(x.height, 300);
  near(x.left, 0);
  near(x.top, 80);
  near(x.panX, 0);
});

test('fits portrait background without stretching or overflowing', () => {
  const x = viewportLayout(800, 1600, 600, 460);
  near(x.width, 230);
  near(x.height, 460);
  near(x.left, 185);
  near(x.top, 0);
});

test('50% zoom shrinks content, never viewport', () => {
  const x = viewportLayout(2400, 1200, 600, 460, 50);
  near(x.width, 300);
  near(x.height, 150);
  near(x.left, 150);
  near(x.top, 155);
});

test('300% zoom clips inside viewport and clamps drag pan', () => {
  const x = viewportLayout(2400, 1200, 600, 460, 300, 100000, -100000);
  near(x.width, 1800);
  near(x.height, 900);
  near(x.panX, 600);
  near(x.panY, -220);
  near(x.left, 0);
  near(x.top, -440);
});

test('100% fit ignores pan and centers non-overflowing content', () => {
  const x = viewportLayout(1024, 1024, 500, 300, 100, 400, 400);
  near(x.panX, 0);
  near(x.panY, 0);
  near(x.width, 300);
  near(x.left, 100);
});

test('clamps invalid zoom and incomplete resize measurements safely', () => {
  assert.equal(clampZoom(0), 50);
  assert.equal(clampZoom(1000), 300);
  assert.equal(clampZoom('not-a-number'), 100);
  assert.equal(viewportLayout(1200, 800, 0, 460).ready, false);
  assert.equal(viewportLayout(1200, 800, 600, NaN).ready, false);
});

test('viewport transformations do not mutate input token coordinates', () => {
  const token = Object.freeze({ x: .7, y: .4 });
  viewportLayout(2048, 512, 600, 460, 250, -300, 200);
  assert.deepEqual(token, { x: .7, y: .4 });
});
