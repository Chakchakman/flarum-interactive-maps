import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const { code } = transformSync(fs.readFileSync(new URL('../src/forum/components/ImageUploadInput.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-react-jsx'), require.resolve('@babel/plugin-transform-modules-commonjs')],
});
function fixture(read) {
  const selected = []; const exports = {};
  class Component { oninit(vnode) { this.attrs = vnode.attrs; } }
  vm.runInNewContext(code, { exports, require: () => Component, navigator: { clipboard: { read } }, File, m: { redraw() {} } });
  const input = new exports.default(); input.oninit({ attrs: { onSelect: file => selected.push(file) } });
  return { input, selected };
}
test('paste accepts only images in its control and does not read clipboard on initialization', () => {
  let reads = 0; const { input, selected } = fixture(() => { reads++; });
  const file = new File(['pixel'], 'image.png', { type: 'image/png' }); let prevented = false;
  input.paste({ preventDefault: () => { prevented = true; }, clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] } });
  assert.equal(prevented, true); assert.equal(selected[0], file); assert.equal(reads, 0);
  input.paste({ preventDefault() {}, clipboardData: { items: [{ kind: 'string', type: 'text/plain' }] } });
  assert.equal(selected.length, 1); assert.match(input.error, /нет изображения/);
});
test('explicit clipboard button creates a file and blocks duplicate reads', async () => {
  let resolve, calls = 0;
  const { input, selected } = fixture(() => { calls++; return new Promise(done => { resolve = done; }); });
  const pending = input.readClipboard(); await input.readClipboard(); assert.equal(calls, 1);
  resolve([{ types: ['image/png'], getType: async () => new Blob(['pixel'], { type: 'image/png' }) }]); await pending;
  assert.equal(selected.length, 1); assert.equal(selected[0].name, 'clipboard.png'); assert.equal(input.reading, false);
});
test('permission denial offers paste/file fallback and never replaces an existing selection', async () => {
  const { input, selected } = fixture(async () => { throw new Error('NotAllowedError'); });
  await input.readClipboard(); assert.equal(selected.length, 0); assert.match(input.error, /Ctrl\+V/); assert.equal(input.reading, false);
});
test('late clipboard result cannot update a removed component; disabled controls do not read', async () => {
  let resolve, calls = 0;
  const { input, selected } = fixture(() => { calls++; return new Promise(done => { resolve = done; }); });
  input.attrs.disabled = true; await input.readClipboard(); assert.equal(calls, 0);
  input.attrs.disabled = false; const pending = input.readClipboard(); input.onremove();
  resolve([{ types: ['image/png'], getType: async () => new Blob(['pixel'], { type: 'image/png' }) }]); await pending;
  assert.equal(selected.length, 0);
});
