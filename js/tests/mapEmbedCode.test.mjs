import test from 'node:test';
import assert from 'node:assert/strict';
import { mapEmbedCode, parseMapEmbedCode } from '../src/forum/mapEmbedCode.mjs';

test('export generates only a numeric safe marker', () => {
  assert.equal(mapEmbedCode(9), '[interactive-map id=9]');
  assert.equal(mapEmbedCode('42'), '[interactive-map id=42]');
  for (const bad of [0, -3, NaN, '9" onload="evil', '1.5', '0009', 99999999999999999]) {
    assert.throws(() => mapEmbedCode(bad));
  }
});

test('attach dialog parses copied marker and a bare integer', () => {
  assert.equal(parseMapEmbedCode('[interactive-map id=9]'), 9);
  assert.equal(parseMapEmbedCode('  [interactive-map id=42]  '), 42);
  assert.equal(parseMapEmbedCode('9'), 9);
  for (const bad of [
    '[interactive-map id=9] something', 'hello [interactive-map id=9]',
    '<iframe src="https://evil.example"></iframe>', 'http://example.com',
    '[interactive-map id=-1]', '[interactive-map id=0]', '00', '', null,
    '[interactive-map id=9999999999999999999999999999]'
  ]) {
    assert.equal(parseMapEmbedCode(bad), null);
  }
});
