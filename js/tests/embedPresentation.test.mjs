import test from 'node:test';
import assert from 'node:assert/strict';
import { insertMapAtBody, presentationOptions } from '../src/forum/embedPresentation.mjs';

test('existing attachments default to below and expanded', () => {
  assert.deepEqual(presentationOptions(null), { displayPosition: 'below', startsCollapsed: false });
  assert.deepEqual(presentationOptions(), { displayPosition: 'below', startsCollapsed: false });
  assert.deepEqual(presentationOptions({ displayPosition: 'above', startsCollapsed: true }),
    { displayPosition: 'above', startsCollapsed: true });
});

test('placement keeps author header before map and text; footer stays last', () => {
  for (const position of ['above', 'below']) {
    const header = { attrs: { className: 'Post-header' } };
    const body = { attrs: { className: 'Post-body extra-class' } };
    const footer = { attrs: { className: 'Post-footer' } };
    const map = { tag: 'map' };
    const children = [header, body, footer];
    insertMapAtBody(children, map, position);
    assert.deepEqual(children, position === 'above' ? [header, map, body, footer] : [header, body, map, footer]);
  }
});

test('unknown body structure keeps existing content order and appends a map', () => {
  const children = [{ attrs: { className: 'Post-body-other' } }, null];
  const original = [...children];
  const map = { tag: 'map' };
  insertMapAtBody(children, map, 'above');
  assert.deepEqual(children, [...original, map]);
});
