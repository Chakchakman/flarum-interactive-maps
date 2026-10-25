import test from 'node:test';
import assert from 'node:assert/strict';
import { gridStyle, GRID_OPACITY } from '../src/forum/gridStyle.mjs';

test('legacy maps retain white 48% one-pixel grid defaults', () => {
  assert.deepEqual(gridStyle(), { gridColor: '#ffffff', gridLineWidth: 1 });
  assert.equal(GRID_OPACITY, 0.48);
});
test('grid color and half-pixel width choices are preserved', () => {
  for (const width of [0.5, 1, 1.5, 3, 5]) {
    assert.deepEqual(gridStyle({ gridColor: '#Aa11FF', gridLineWidth: width }), {
      gridColor: '#aa11ff', gridLineWidth: width,
    });
  }
});
test('unsafe colors and unsupported widths fall back independently', () => {
  for (const color of ['red', '#fff', '#abcdef\n', 'url(https://example.test)', null, 123]) {
    assert.equal(gridStyle({ gridColor: color }).gridColor, '#ffffff');
  }
  for (const width of [0, -1, 5.5, 1.25, '2', true, null, NaN, Infinity]) {
    assert.equal(gridStyle({ gridLineWidth: width }).gridLineWidth, 1);
  }
});
