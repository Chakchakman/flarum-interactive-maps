import test from 'node:test';
import assert from 'node:assert/strict';
import { canDragPostToken } from '../src/forum/inlineTokenPermission.mjs';

const t = (actorId, ownerUserId, canManageMaps = false) =>
  canDragPostToken({ actorId, ownerUserId, canManageMaps });

test('only authorized client avatars are interactive', () => {
  assert.equal(t('2', 2), true);
  assert.equal(t(2, '2'), true);
  assert.equal(t('3', 2), false);
  assert.equal(t('2', null), false);
  assert.equal(t(null, 2), false);
  assert.equal(t(undefined, 2), false);
  assert.equal(t(1, null, true), true);
  assert.equal(t(1, '2', true), true);
  assert.equal(t(null, 2, true), false);
});
