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

test('post stream renders an unkeyed map vnode alongside unkeyed Flarum comment nodes', async () => {
  // Flarum CommentPost.content() already returns unkeyed <Comment> children.
  // Keying only the injected map crashes the Mithril post stream.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/forum/index.js', import.meta.url), 'utf8');
  const start = source.indexOf('children.push(<EmbeddedPostMap');
  const end = source.indexOf('/>);', start);
  assert.ok(start >= 0 && end > start, 'inline map vnode must be present');
  const mapVnode = source.slice(start, end + 4);
  assert.doesNotMatch(mapVnode, /\bkey\s*=/, 'do not mix keyed and unkeyed children in CommentPost.content()');
});
