import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as response from '../src/forum/apiResponse.mjs';
import * as picker from '../src/forum/mapPicker.mjs';
const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const { code } = transformSync(fs.readFileSync(new URL('../src/forum/components/AttachMapModal.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [require.resolve('@babel/plugin-transform-react-jsx'), require.resolve('@babel/plugin-transform-modules-commonjs')],
});
function setup(request) {
  class Modal {
    hide() { this.hidden = true; }
    onremove() {}
    get dismissibleOptions() { return { viaCloseButton: true, viaEscKey: true, viaBackdropClick: true }; }
  }
  const exports = {};
  const modules = {
    'flarum/common/components/Modal': Modal,
    'flarum/common/components/Button': class {},
    '../api': { endpoint: (path) => '/api/' + path, displayError: (error) => error.message },
    '../apiResponse.mjs': response, '../mapPicker.mjs': picker,
  };
  vm.runInNewContext(code, { exports, require: (id) => {
    if (!(id in modules)) throw new Error('Unexpected import ' + id);
    return modules[id];
  }, app: { request }, m: { redraw() {} } });
  const modal = new exports.default();
  const changes = [];
  Object.assign(modal, { maps: [{ id: 9, title: 'Map' }], selectedId: 9, query: '',
    loading: false, loadingMaps: false, closed: false, error: '', loadError: '',
    attrs: { post: { id: () => '2', pushAttributes: (attrs) => changes.push(attrs) } },
  });
  return { modal, changes };
}
const event = { preventDefault() {} };
test('attachment sends the post-scoped body once and updates post only after success', async () => {
  let finish;
  const calls = [];
  const { modal, changes } = setup((request) => { calls.push(request); return new Promise((resolve) => { finish = resolve; }); });
  const pending = modal.attach(event);
  await modal.attach(event);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/chak-map-embeds');
  assert.equal(JSON.stringify(calls[0].body), JSON.stringify(response.resourceBody('chak-map-embeds', { postId: 2, mapId: 9 })));
  assert.equal(changes.length, 0);
  modal.hide();
  assert.equal(modal.closed, false);
  assert.equal(modal.dismissibleOptions.viaEscKey, false);
  finish(); await pending;
  assert.equal(changes[0].hasChakMap, true);
  assert.equal(modal.hidden, true);
});
test('permission failure preserves post and selection, allows retry', async () => {
  let fail = true;
  const { modal, changes } = setup(async () => { if (fail) throw new Error('403'); });
  await modal.attach(event);
  assert.equal(changes.length, 0);
  assert.match(modal.error, /403/);
  assert.equal(modal.loading, false);
  assert.equal(modal.selectedId, 9);
  fail = false; await modal.attach(event);
  assert.equal(changes.length, 1);
});
test('late catalog response after closing cannot populate a removed dialog', async () => {
  let finish;
  const { modal } = setup(() => new Promise((resolve) => { finish = resolve; }));
  const pending = modal.loadMaps();
  modal.hide();
  finish({ data: [{ type: 'chak-maps', id: '19', attributes: { title: 'Late' } }] });
  await pending;
  assert.equal(modal.maps[0].id, 9);
});
test('catalog failure can be retried and does not submit an attachment', async () => {
  let fail = true;
  const { modal, changes } = setup(async () => {
    if (fail) throw new Error('Network error');
    return { data: [{ type: 'chak-maps', id: '19', attributes: { title: 'New' } }] };
  });
  await modal.loadMaps(); assert.match(modal.loadError, /Network/);
  fail = false; await modal.loadMaps();
  assert.equal(modal.maps[0].id, 19);
  assert.equal(modal.loadError, '');
  assert.equal(changes.length, 0);
});
