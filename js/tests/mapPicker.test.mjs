import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPickerMaps, pickerMapId } from '../src/forum/mapPicker.mjs';
const maps = [{ id: 9, title: 'Склад Zetatech' }, { id: 19, title: 'Лес' }];
test('picker searches titles case-insensitively and exact IDs/markers', () => {
  assert.deepEqual(filterPickerMaps(maps, ' СКЛАД '), [maps[0]]);
  assert.deepEqual(filterPickerMaps(maps, '9'), [maps[0]]);
  assert.deepEqual(filterPickerMaps(maps, '[interactive-map id=19]'), [maps[1]]);
  assert.deepEqual(filterPickerMaps(maps, ''), maps);
  assert.deepEqual(filterPickerMaps(maps, 'missing'), []);
});
test('picker requires a valid selection or explicit numeric reference', () => {
  assert.equal(pickerMapId(maps, 9, ''), 9);
  assert.equal(pickerMapId(maps, 23, ''), null);
  assert.equal(pickerMapId(maps, null, 'Склад'), null);
  assert.equal(pickerMapId([], null, '[interactive-map id=200]'), 200);
  for (const input of ['0', '-1', '9.1', '<iframe>', '9007199254740992']) {
    assert.equal(pickerMapId(maps, null, input), null);
  }
});
