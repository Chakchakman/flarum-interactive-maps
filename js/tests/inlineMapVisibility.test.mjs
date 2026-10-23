import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRenderInlineMap } from '../src/forum/inlineMapVisibility.mjs';

const allowed = {
  isComment: true,
  hasLinkedMap: true,
  isHidden: false,
  authenticated: true,
};

test('show only a linked visible comment to a signed-in viewer', () => {
  assert.equal(shouldRenderInlineMap(allowed), true);
  assert.equal(shouldRenderInlineMap({ ...allowed, hasLinkedMap: false }), false);
  assert.equal(shouldRenderInlineMap({ ...allowed, isHidden: true }), false);
  assert.equal(shouldRenderInlineMap({ ...allowed, authenticated: false }), false);
  assert.equal(shouldRenderInlineMap({ ...allowed, isComment: false }), false);
  assert.equal(shouldRenderInlineMap({ ...allowed, hasLinkedMap: 1 }), false);
  assert.equal(shouldRenderInlineMap({ ...allowed, hasLinkedMap: undefined }), false);
  // Real Flarum 2 post payload omits hiddenAt for visible comments.
  assert.equal(shouldRenderInlineMap({ ...allowed, isHidden: undefined }), true);
  assert.equal(shouldRenderInlineMap({ ...allowed, isHidden: null }), true);
  assert.equal(shouldRenderInlineMap({ ...allowed, isHidden: false }), true);
  assert.equal(shouldRenderInlineMap({ ...allowed, isHidden: true }), false);
});
