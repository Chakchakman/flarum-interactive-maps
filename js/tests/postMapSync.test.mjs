import test from 'node:test';
import assert from 'node:assert/strict';
import { VisiblePostMapSync } from '../src/forum/postMapSync.mjs';
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture(send = async ids => ({ data: ids.map(id => ({ id, attributes: { available: true } })) })) {
  let visible = true; const timers = new Map(); let next = 0;
  const sync = new VisiblePostMapSync(send, { isVisible: () => visible,
    setTimer: (callback, delay) => { const id = ++next; timers.set(id, { callback, delay }); return id; }, clearTimer: id => timers.delete(id) });
  const add = id => {
    const state = { busy: false, epoch: 0, applied: [], errors: [] };
    const registration = sync.register(id, { isBusy: () => state.busy, epoch: () => state.epoch,
      apply: snapshot => state.applied.push(snapshot), onError: error => state.errors.push(error) });
    registration.setActive(true); return { state, ...registration };
  };
  return { sync, add, timers, setVisible: value => { visible = value; sync.wake(); } };
}
test('shared refresh deduplicates posts and splits visible demand into bounded batches', async () => {
  const calls = []; const f = fixture(async ids => { calls.push(ids); return { data: ids.map(id => ({ id, attributes: { available: true } })) }; });
  for (let id = 1; id <= 23; id++) f.add(id);
  const duplicate = f.add(1); await f.sync.tick();
  assert.deepEqual(calls.map(ids => ids.length), [20, 3]); assert.equal(duplicate.state.applied.length, 1); assert.equal(f.timers.size, 1);
});
test('hidden tabs and inactive boards stop scheduling; visibility resumes with one timer', async () => {
  const f = fixture(); const c = f.add(1); f.setVisible(false); assert.equal(f.timers.size, 0);
  await f.sync.tick(); assert.equal(c.state.applied.length, 0); f.setVisible(true); assert.equal(f.timers.size, 1);
  c.setActive(false); assert.equal(f.timers.size, 0); await f.sync.tick(); assert.equal(c.state.applied.length, 0);
  c.setActive(true); c.remove(); assert.equal(f.timers.size, 0);
});
test('a read begun before a complete local drag/write cannot replace the newer position', async () => {
  const reply = deferred(); const f = fixture(() => reply.promise); const c = f.add(1); const pending = f.sync.tick();
  c.state.epoch++; reply.resolve({ data: [{ id: '1', attributes: { available: true, tokens: ['old'] } }] });
  await pending; assert.equal(c.state.applied.length, 0);
});
test('busy consumers are skipped before sending and when the response arrives', async () => {
  const reply = deferred(); const f = fixture(() => reply.promise); const first = f.add(1); const second = f.add(2);
  first.state.busy = true; const pending = f.sync.tick(); second.state.busy = true;
  reply.resolve({ data: [{ id: '2', attributes: { available: true } }] }); await pending;
  assert.equal(first.state.applied.length, 0); assert.equal(second.state.applied.length, 0);
});
test('refreshes never overlap and never update removed/offscreen consumers', async () => {
  const reply = deferred(); let calls = 0; const f = fixture(() => { calls++; return reply.promise; });
  const first = f.add(1); const second = f.add(2); const pending = f.sync.tick(); await f.sync.tick(); assert.equal(calls, 1);
  first.remove(); second.setActive(false); reply.resolve({ data: [] }); await pending;
  assert.equal(first.state.errors.length, 0); assert.equal(second.state.errors.length, 0); assert.equal(f.timers.size, 0);
});
test('temporary errors retain registrations and back off, then recover automatically', async () => {
  let fail = true; const f = fixture(async ids => { if (fail) throw new Error('Offline'); return { data: ids.map(id => ({ id, attributes: { available: true } })) }; }); const c = f.add(1);
  for (const delay of [10000, 20000, 30000, 30000]) { await f.sync.tick(); assert.equal([...f.timers.values()][0].delay, delay); }
  assert.equal(c.state.errors.length, 4); assert.equal(c.state.applied.length, 0);
  fail = false; await f.sync.tick(); assert.equal(c.state.applied.length, 1); assert.equal([...f.timers.values()][0].delay, 5000);
});
test('snapshot post IDs isolate boards and unavailable posts receive no other board payload', async () => {
  const f = fixture(async () => ({ data: [{ id: '2', attributes: { available: false } }, { id: '1', attributes: { available: true, mapId: 42, tokens: ['one'] } }] }));
  const first = f.add(1); const second = f.add(2); await f.sync.tick();
  assert.equal(first.state.applied[0].mapId, 42); assert.deepEqual(second.state.applied, [{ available: false }]);
});
test('malformed snapshots are errors rather than silently removing a visible map', async () => {
  const f = fixture(async () => ({ data: [] })); const c = f.add(1); await f.sync.tick();
  assert.equal(c.state.errors.length, 1); assert.equal(c.state.applied.length, 0);
});
