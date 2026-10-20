import test from 'node:test';
import assert from 'node:assert/strict';
import { DebouncedGridSaveQueue } from '../src/forum/gridSaveQueue.mjs';

const pause = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, reason) {
  for (let n = 0; n < 80; n += 1) {
    if (predicate()) return;
    await pause(5);
  }
  throw new Error(`Timed out: ${reason}`);
}
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('rapid slider edits coalesce into the newest grid PATCH', async () => {
  const calls = [];
  const queue = new DebouncedGridSaveQueue(async (batch) => {
    calls.push(batch);
    return { ...batch };
  }, { delay: 15 });

  queue.queue({ gridSize: 60 });
  queue.queue({ gridSize: 61 });
  queue.queue({ gridOffsetX: -12 });
  queue.queue({ gridSize: 62 });
  assert.equal(queue.hasPending(), true);
  assert.equal(calls.length, 0);
  await until(() => !queue.hasPending(), 'first debounce flush');
  assert.deepEqual(calls, [{ gridSize: 62, gridOffsetX: -12 }]);
});

test('a PATCH in progress cannot be overtaken by a newer grid PATCH', async () => {
  const first = deferred();
  const second = deferred();
  const calls = [];
  const queue = new DebouncedGridSaveQueue(async (batch) => {
    calls.push(batch);
    return calls.length === 1 ? first.promise : second.promise;
  }, { delay: 5 });

  queue.queue({ gridSize: 70 });
  await until(() => calls.length === 1, 'first request');
  queue.queue({ gridSize: 75 });
  queue.queue({ gridOffsetY: 42 });
  await pause(20);
  assert.equal(calls.length, 1, 'never send overlapping PATCH requests');
  first.resolve({ gridSize: 70 });
  await until(() => calls.length === 2, 'second request');
  assert.deepEqual(calls[1], { gridSize: 75, gridOffsetY: 42 });
  second.resolve({ gridSize: 75, gridOffsetY: 42 });
  await until(() => !queue.hasPending(), 'queue drain');
});

test('failure reports only unsaved batch and preserves newer pending values', async () => {
  const first = deferred();
  const second = deferred();
  let sends = 0;
  const failures = [];
  const queue = new DebouncedGridSaveQueue(async () => {
    return ++sends === 1 ? first.promise : second.promise;
  }, {
    delay: 10,
    onFailure: (error, batch, pending) => failures.push({ error: error.message, batch, pending }),
  });

  queue.queue({ gridSize: 40 });
  await until(() => sends === 1, 'first request');
  queue.queue({ gridSize: 80 });
  first.reject(new Error('HTTP 500'));
  await until(() => failures.length === 1, 'failure callback');
  assert.deepEqual(failures[0].batch, { gridSize: 40 });
  assert.deepEqual(failures[0].pending, { gridSize: 80 });
  await until(() => sends === 2, 'second send');
  second.resolve({ gridSize: 80 });
  await until(() => !queue.hasPending(), 'queue drain');
});

test('flushNow sends a value even before debounce delay expires', async () => {
  const calls = [];
  const queue = new DebouncedGridSaveQueue(async (batch) => {
    calls.push(batch);
    return batch;
  }, { delay: 2000 });
  queue.queue({ gridEnabled: false });
  await queue.flushNow();
  assert.deepEqual(calls, [{ gridEnabled: false }]);
  assert.equal(queue.hasPending(), false);
});
