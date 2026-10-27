import test from 'node:test';
import assert from 'node:assert/strict';
import { LatestTokenMoveQueue } from '../src/forum/tokenMoveQueue.mjs';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function until(predicate, label) {
  for (let i = 0; i < 40; i += 1) {
    if (predicate()) return;
    await tick();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

test('rapid moves send first and latest only, in order', async () => {
  const first = deferred();
  const last = deferred();
  const calls = [];
  const successes = [];
  const queue = new LatestTokenMoveQueue(
    (id, pos) => {
      calls.push({ id, ...pos });
      return calls.length === 1 ? first.promise : last.promise;
    },
    { onSuccess: (id) => successes.push(id) }
  );

  queue.enqueue(7, { x: 0.1, y: 0.2 }, { x: 0.05, y: 0.05 });
  queue.enqueue(7, { x: 0.3, y: 0.4 }, { x: 0.1, y: 0.2 });
  queue.enqueue(7, { x: 0.7, y: 0.8 }, { x: 0.3, y: 0.4 });
  assert.equal(calls.length, 1, 'never send overlapping requests for the same token');
  assert.equal(queue.hasPending(), true);

  first.resolve({ x: 0.1, y: 0.2 });
  await until(() => calls.length === 2, 'latest request');
  assert.deepEqual(calls, [
    { id: '7', x: 0.1, y: 0.2 },
    { id: '7', x: 0.7, y: 0.8 },
  ]);
  assert.equal(queue.hasPending(), true);

  last.resolve({ x: 0.7, y: 0.8 });
  await until(() => !queue.hasPending(), 'queue drain');
  assert.deepEqual(successes, ['7', '7']);
});

test('failure of an obsolete write does not revert a newer queued move', async () => {
  const first = deferred();
  const last = deferred();
  const failures = [];
  let calls = 0;
  const queue = new LatestTokenMoveQueue(
    () => (++calls === 1 ? first.promise : last.promise),
    { onFailure: (id, saved, error) => failures.push({ id, saved, message: error.message }) }
  );

  queue.enqueue(3, { x: 0.2, y: 0.2 }, { x: 0.1, y: 0.1 });
  queue.enqueue(3, { x: 0.9, y: 0.9 }, { x: 0.2, y: 0.2 });
  first.reject(new Error('early request failed'));
  await until(() => calls === 2, 'newer request');
  assert.deepEqual(failures, [], 'do not roll back while newer position is pending');
  last.resolve({ x: 0.9, y: 0.9 });
  await until(() => !queue.hasPending(), 'queue drain');
  assert.deepEqual(failures, []);
});

test('last failed write rolls back only to last server-confirmed position', async () => {
  const failures = [];
  let requests = 0;
  const queue = new LatestTokenMoveQueue(
    async (id, position) => {
      requests += 1;
      if (requests === 2) throw new Error('HTTP 500');
      return position;
    },
    { onFailure: (id, saved) => failures.push({ id, saved }) }
  );

  queue.enqueue(4, { x: 0.4, y: 0.4 }, { x: 0.1, y: 0.1 });
  await until(() => !queue.hasPending(), 'initial confirmed move');
  queue.enqueue(4, { x: 0.9, y: 0.6 }, { x: 0.4, y: 0.4 });
  await until(() => !queue.hasPending(), 'failed move');
  assert.deepEqual(failures, [{ id: '4', saved: { x: 0.4, y: 0.4 } }]);
});

test('different tokens can save independently', async () => {
  const waitA = deferred();
  const waitB = deferred();
  const calls = [];
  const queue = new LatestTokenMoveQueue((id, position) => {
    calls.push({ id, ...position });
    return id === 'a' ? waitA.promise : waitB.promise;
  });

  queue.enqueue('a', { x: 0.1, y: 0.2 }, { x: 0, y: 0 });
  queue.enqueue('b', { x: 0.3, y: 0.4 }, { x: 0, y: 0 });
  assert.equal(calls.length, 2);
  waitB.resolve({ x: 0.3, y: 0.4 });
  await tick();
  assert.equal(queue.hasPending(), true);
  waitA.resolve({ x: 0.1, y: 0.2 });
  await until(() => !queue.hasPending(), 'independent queues');
});

test('each chained move uses the last acknowledged movement version', async () => {
  const first = deferred(); const calls = [];
  const queue = new LatestTokenMoveQueue(async (id, target, confirmed) => {
    calls.push({ target, confirmed });
    return calls.length === 1 ? first.promise : { ...target, moveVersion: 'v3' };
  });
  queue.enqueue(1, { x: 0.2, y: 0.3 }, { x: 0.1, y: 0.1, moveVersion: 'v1' });
  queue.enqueue(1, { x: 0.4, y: 0.5 }, { x: 0.2, y: 0.3, moveVersion: 'v1' });
  first.resolve({ x: 0.2, y: 0.3, moveVersion: 'v2' });
  await until(() => !queue.hasPending(), 'drained');
  assert.equal(calls[0].confirmed.moveVersion, 'v1');
  assert.equal(calls[1].confirmed.moveVersion, 'v2');
});

test('a conflict discards queued stale destinations and adopts only the matching authoritative token', async () => {
  const request = deferred(); const failures = []; let calls = 0;
  const queue = new LatestTokenMoveQueue(() => { calls++; return request.promise; }, {
    onFailure: (id, confirmed) => failures.push(confirmed),
  });
  queue.enqueue(7, { x: 0.2, y: 0.3 }, { x: 0.1, y: 0.1, moveVersion: 'a'.repeat(64) });
  queue.enqueue(7, { x: 0.4, y: 0.5 }, { x: 0.2, y: 0.3, moveVersion: 'a'.repeat(64) });
  request.reject({ status: 409, response: { errors: [{ code: 'token_move_conflict', meta: {
    currentToken: { type: 'chak-tokens', id: '7', attributes: { x: 0.8, y: 0.9, moveVersion: 'b'.repeat(64) } },
  } }] } });
  await until(() => !queue.hasPending(), 'conflict drain');
  assert.equal(calls, 1); assert.equal(failures.length, 1);
  assert.equal(failures[0].x, 0.8); assert.equal(failures[0].moveVersion, 'b'.repeat(64));
});

test('revocation and missing preconditions stop queued moves without replaying them', async () => {
  for (const status of [403, 404, 428]) {
    const request = deferred(); let calls = 0;
    const queue = new LatestTokenMoveQueue(() => { calls++; return request.promise; });
    queue.enqueue(1, { x: 0.2, y: 0.3 }, { x: 0.1, y: 0.1 });
    queue.enqueue(1, { x: 0.4, y: 0.5 }, { x: 0.2, y: 0.3 });
    request.reject({ status });
    await until(() => !queue.hasPending(), 'terminal drain');
    assert.equal(calls, 1);
  }
});

test('a conflict cannot apply another token or malformed coordinates', async () => {
  for (const attributes of [{ x: 0.8, y: 0.9, moveVersion: 'b'.repeat(64) }, { x: 99, y: 0.9, moveVersion: 'b'.repeat(64) }]) {
    const failures = [];
    const queue = new LatestTokenMoveQueue(async () => { throw { status: 409, response: { errors: [{ code: 'token_move_conflict', meta: {
      currentToken: { type: 'chak-tokens', id: '99', attributes },
    } }] } }; }, { onFailure: (id, confirmed) => failures.push(confirmed) });
    queue.enqueue(1, { x: 0.2, y: 0.3 }, { x: 0.1, y: 0.1 });
    await until(() => !queue.hasPending(), 'malformed drain');
    assert.deepEqual(failures[0], { x: 0.1, y: 0.1 });
  }
});
