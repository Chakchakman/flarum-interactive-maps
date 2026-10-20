import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_IMAGE, gridMetrics, snapToCellCenter, validImageSize } from '../src/forum/gridGeometry.mjs';

const approx = (actual, expected, epsilon = 1e-10) => assert.ok(
  Math.abs(actual - expected) <= epsilon,
  `expected ${actual} to be near ${expected}`
);

test('native image dimensions determine grid aspect ratio', () => {
  for (const [w, h] of [[1000, 1000], [2048, 1024], [720, 1280]]) {
    const metrics = gridMetrics(64, 7, -11, { width: w, height: h });
    assert.equal(metrics.aspectRatio, `${w} / ${h}`);
    assert.equal(metrics.width, w);
    assert.equal(metrics.height, h);
    assert.equal(metrics.offsetX, 7);
    assert.equal(metrics.offsetY, -11);
  }
});

test('invalid source dimensions fall back safely instead of zero / NaN', () => {
  assert.equal(validImageSize(0, 720), false);
  assert.equal(validImageSize(-10, 720), false);
  assert.equal(validImageSize(1280, 853), true);
  assert.deepEqual(
    gridMetrics(64, 0, 0, { width: 0, height: 0 }),
    { width: FALLBACK_IMAGE.width, height: FALLBACK_IMAGE.height, cell: 64, offsetX: 0, offsetY: 0, aspectRatio: '1280 / 853' }
  );
});

test('snap keeps the center of the exact SVG cell with positive/negative offset', () => {
  approx(snapToCellCenter(0.05, 1000, 100, 0), 0.05);
  approx(snapToCellCenter(0.101, 1000, 100, 0), 0.15);
  approx(snapToCellCenter(0.299, 1000, 100, 10), 0.26);
  approx(snapToCellCenter(0.299, 1000, 100, -10), 0.34);
});

test('snap is independent of browser render width and supports portrait images', () => {
  const image = { width: 720, height: 1280 };
  const metrics = gridMetrics(80, 0, 0, image);
  const x = snapToCellCenter(0.17, metrics.width, metrics.cell, metrics.offsetX);
  const y = snapToCellCenter(0.17, metrics.height, metrics.cell, metrics.offsetY);
  approx(x, 120 / 720);
  approx(y, 200 / 1280);
});

test('positions near the edge remain within normalized range', () => {
  assert.equal(snapToCellCenter(1, 1030, 100, 0), 1);
  assert.equal(snapToCellCenter(0, 1030, 100, 50), 0);
  assert.equal(snapToCellCenter(-5, 1000, 100, 0), 0.05);
});
