import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileTokens } from '../src/forum/reconcileTokens.mjs';

const fixture = (id = 1) => ({ id, mapId: 9, name: 'Token', imageUrl: '/token.svg',
  x: 0.25, y: 0.5, ownerUserId: 7, ownerUsername: 'player', moveVersion: 'a'.repeat(64) });
const typed = token => {
  const { id, ...attributes } = token;
  return { type: 'chak-tokens', id: String(id), attributes };
};

test('idle snapshots preserve token and array identities across repeated polls', () => {
  const previous = Array.from({ length: 100 }, (_, i) => fixture(i + 1));
  for (let i = 0; i < 100; i++) {
    assert.equal(reconcileTokens(previous, previous.map(typed)), previous);
  }
});

test('every displayed field and the move precondition can independently change', () => {
  const previous = [fixture()];
  for (const [key, value] of Object.entries({ name: 'Renamed', imageUrl: '/new.svg',
    x: 0.75, y: 0.125, ownerUserId: null, ownerUsername: null, moveVersion: 'b'.repeat(64), mapId: 10 })) {
    const incoming = { ...previous[0], [key]: value };
    const result = reconcileTokens(previous, [typed(incoming)]);
    assert.notEqual(result, previous, key);
    assert.deepEqual(result, [incoming]);
  }
});

test('local optimistic coordinates are compared to the actual incoming state', () => {
  const original = fixture();
  const previous = [{ ...original, x: 0.9 }];
  const result = reconcileTokens(previous, [typed(original)]);
  assert.equal(result[0].x, original.x);
  assert.notEqual(result, previous);
});

test('addition, removal and ordering are retained while unchanged tokens are reused', () => {
  const previous = [fixture(1), fixture(2)];
  assert.deepEqual(reconcileTokens(previous, []), []);
  const reordered = reconcileTokens(previous, [typed(previous[1]), typed(previous[0]), typed(fixture(3))]);
  assert.equal(reordered[0], previous[1]);
  assert.equal(reordered[1], previous[0]);
  assert.equal(reordered[2].id, 3);
  assert.deepEqual(reconcileTokens([], []), []);
});

test('new or removed attributes are never hidden by a fixed comparison field list', () => {
  const previous = [fixture()];
  const added = reconcileTokens(previous, [typed({ ...previous[0], futureField: 'visible' })]);
  assert.equal(added[0].futureField, 'visible');
  assert.deepEqual(reconcileTokens(added, previous), previous);
});

test('invalid snapshots fail rather than clearing a valid board silently', () => {
  const previous = [fixture()];
  for (const input of [null, undefined, {}, [null], [{ type: 'unexpected', id: '1' }]]) {
    assert.throws(() => reconcileTokens(previous, input));
    assert.equal(previous[0].x, 0.25);
  }
});
