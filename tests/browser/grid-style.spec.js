const { test, expect } = require('@playwright/test');
const { login, api, mapImage, createMap, discussion } = require('./helpers');
const isPatch = request => request.method() === 'PATCH' ||
  request.headers()['x-http-method-override']?.toUpperCase() === 'PATCH';

test('grid color and thickness persist in editor and post without changing geometry or tokens', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await mapImage(page);
  const mapId = await createMap(page, 'Styled grid ' + Date.now());
  const token = await api(page, 'POST', 'chak-maps/' + mapId + '/tokens', {
    name: 'Style fixture token', imageUrl: '/smoke-map.svg', ownerUsername: 'smokeadmin',
  }, 201, 'chak-tokens');
  const before = await api(page, 'GET', 'chak-maps/' + mapId);
  expect(before.data.attributes.gridColor).toBe('#ffffff');
  expect(before.data.attributes.gridLineWidth).toBe(1);
  await page.goto('/maps/' + mapId);
  const color = page.getByLabel('Цвет сетки', { exact: true });
  const width = page.getByLabel(/^Толщина сетки:/);
  await expect(color).toHaveValue('#ffffff');
  const saved = page.waitForResponse(response => isPatch(response.request()) &&
    new URL(response.url()).pathname === '/api/chak-maps/' + mapId);
  await color.fill('#ff0000');
  await color.dispatchEvent('input');
  await width.fill('3');
  await width.dispatchEvent('input');
  expect((await saved).status()).toBe(200);
  const path = page.locator('.ChakMap-grid path');
  await expect(path).toHaveAttribute('stroke', '#ff0000');
  await expect(path).toHaveAttribute('stroke-width', '3');
  await expect(path).toHaveAttribute('stroke-opacity', '0.48');
  expect(await path.evaluate(element => getComputedStyle(element).strokeWidth)).toBe('3px');
  expect(await path.evaluate(element => getComputedStyle(element).strokeOpacity)).toBe('0.48');
  await page.reload();
  await expect(color).toHaveValue('#ff0000');
  await expect(width).toHaveValue('3');

  for (const attributes of [
    { gridColor: 'url(example.test)' }, { gridColor: '#fff' },
    { gridLineWidth: 0 }, { gridLineWidth: 6 }, { gridLineWidth: 1.25 },
    { gridLineWidth: '2' }, { gridLineWidth: null }, { gridLineWidth: true },
  ]) await api(page, 'PATCH', 'chak-maps/' + mapId, attributes, 400);

  const pattern = '**/api/chak-maps/' + mapId;
  const failPatchOnce = async route => {
    if (!isPatch(route.request())) return route.fallback();
    await page.unroute(pattern, failPatchOnce);
    await route.fulfill({ status: 503, contentType: 'application/vnd.api+json',
      json: { errors: [{ detail: 'Temporary grid save failure' }] } });
  };
  await page.route(pattern, failPatchOnce);
  await color.fill('#0000ff');
  await color.dispatchEvent('input');
  await expect(page.locator('.ChakMaps-page .ChakMaps-error')).toContainText('Не удалось сохранить сетку');
  await expect(color).toHaveValue('#ff0000');
  await color.fill('#112233');
  await color.dispatchEvent('input');
  await expect.poll(async () => (await api(page, 'GET', 'chak-maps/' + mapId)).data.attributes.gridColor).toBe('#112233');
  const after = await api(page, 'GET', 'chak-maps/' + mapId);
  for (const key of ['gridSize', 'gridOffsetX', 'gridOffsetY', 'gridEnabled', 'snapToGrid']) {
    expect(after.data.attributes[key]).toBe(before.data.attributes[key]);
  }
  const stored = after.included.find(item => item.id === token.data.id);
  expect(stored.attributes.x).toBe(token.data.attributes.x);
  expect(stored.attributes.y).toBe(token.data.attributes.y);
  expect(after.data.attributes.gridLineWidth).toBe(3);
  await page.goto('/');
  const { post, id } = await discussion(page, 'Styled grid in post');
  await api(page, 'POST', 'chak-map-embeds', { postId: Number(id), mapId: Number(mapId) }, 201, 'chak-map-embeds');
  await page.reload();
  const embedded = post.locator('.ChakMapEmbed .ChakMap-grid path');
  await expect(embedded).toHaveAttribute('stroke', '#112233');
  await expect(embedded).toHaveAttribute('stroke-width', '3');
  expect(errors).toEqual([]);
});
