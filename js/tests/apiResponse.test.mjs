import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMap,
  normalizeMapList,
  normalizeMapResponse,
  normalizeToken,
  canManageResponse,
  resourceBody,
  apiErrorMessage,
} from '../src/forum/apiResponse.mjs';

const token = { type: 'chak-tokens', id: '4', attributes: {
  mapId: 7, name: 'Райан', imageUrl: '/avatar.png', x: 0.25, y: 0.75,
  ownerUserId: 2, ownerUsername: 'ryan'
}};
const map = {
  type: 'chak-maps', id: '7', attributes: {
    title: 'Тестовая карта', backgroundUrl: '/map.jpg',
    gridSize: 64, gridOffsetX: 0, gridOffsetY: -16,
    gridEnabled: true, snapToGrid: true
  },
  relationships: { tokens: { data: [{ type: 'chak-tokens', id: '4' }] } }
};

test('typed JSON:API map with included tokens converts to working UI model', () => {
  const result = normalizeMapResponse({ data: map, included: [token], meta: { canManage: false } });
  assert.equal(result.id, 7);
  assert.equal(result.title, 'Тестовая карта');
  assert.equal(result.gridOffsetY, -16);
  assert.deepEqual(result.tokens[0], { ...token.attributes, id: 4 });
});

test('empty token relationship returns empty list', () => {
  const result = normalizeMap({ ...map, relationships: { tokens: { data: [] } } }, []);
  assert.deepEqual(result.tokens, []);
});

test('list normalizes typed resources and moves canManage to meta', () => {
  const response = {
    data: [{ type: map.type, id: map.id, attributes: map.attributes }, { type: 'chak-maps', id: '8', attributes: { title: 'Вторая карта' } }],
    meta: { canManage: true },
  };
  assert.equal(normalizeMapList(response)[0].id, 7);
  assert.equal(normalizeMapList(response)[1].title, 'Вторая карта');
  assert.equal(canManageResponse(response), true);
  assert.equal(canManageResponse({ meta: { canManage: false }, canManage: true }), false);
});

test('typed token movement response still exposes flat x/y fields', () => {
  assert.deepEqual(normalizeToken(token), { id: 4, ...token.attributes });
});

test('write requests are wrapped in a standard JSON:API attributes object', () => {
  assert.deepEqual(resourceBody('chak-tokens', { x: 0.1, y: 0.9 }), {
    data: { type: 'chak-tokens', attributes: { x: 0.1, y: 0.9 } },
  });
});

test('error details and legacy error bodies both display understandable messages', () => {
  assert.equal(apiErrorMessage({ response: { errors: [{ status: '403', detail: 'Нет прав' }] } }), 'Нет прав');
  assert.equal(apiErrorMessage({ response: { error: 'Фишка не найдена' } }), 'Фишка не найдена');
  assert.equal(apiErrorMessage({ errors: [{ title: 'Forbidden' }] }), 'Forbidden');
  assert.equal(apiErrorMessage(new Error('Сеть недоступна')), 'Сеть недоступна');
  assert.equal(apiErrorMessage({}), 'Неизвестная ошибка');
});

test('invalid data cannot silently erase token positions', () => {
  assert.throws(() => normalizeMapResponse({ data: { ...map, relationships: { tokens: { data: [{ type: 'chak-tokens', id: '88' }] } } }, included: [token] }), /Отсутствует фишка/);
  assert.throws(() => normalizeMap({ type: 'users', id: '1', attributes: {} }), /Неизвестный тип карты/);
  assert.throws(() => normalizeToken({ type: 'chak-maps', id: '4', attributes: {} }), /Неизвестный тип фишки/);
  assert.throws(() => normalizeMap({ type: 'chak-maps', id: 'invalid', attributes: {} }), /Неверный ID/);
});

test('legacy flat data stays readable throughout the API migration', () => {
  const legacyMap = { id: 7, title: 'Старая карта', tokens: [{ id: 4, x: 0.1, y: 0.2 }] };
  assert.deepEqual(normalizeMapResponse({ data: legacyMap }), legacyMap);
  assert.deepEqual(normalizeMapList({ data: [legacyMap] })[0], legacyMap);
  assert.deepEqual(normalizeToken({ id: 4, x: 0.1, y: 0.2 }), { id: 4, x: 0.1, y: 0.2 });
  assert.equal(canManageResponse({ canManage: true }), true);
});
