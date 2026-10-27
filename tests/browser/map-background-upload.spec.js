const { test, expect } = require('@playwright/test');
const { rasterFile: raster, login, api, createMap, discussion, savedPost, mapImage } = require('./helpers');

async function upload(page, path, file, fields = {}, status = 200) {
  const response = await page.request.post('/api/' + path, {
    headers: { 'X-CSRF-Token': await page.evaluate(() => app.session.csrfToken) },
    multipart: { ...fields, image: file },
  });
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

test('create from a device file, replace with JPEG and retry a rejected file without changing tokens or grid', async ({ page }) => {
  await login(page); await mapImage(page); const png = await raster(page); const jpeg = await raster(page, 'image/jpeg');
  await page.goto('/maps');
  await expect(page.getByPlaceholder('введите название карты', { exact: true })).toBeVisible();
  await page.locator('#chak-map-title').fill('Device map ' + Date.now());
  await page.locator('#chak-map-background-file').setInputFiles(png);
  await expect(page.locator('#chak-map-background-url')).toBeDisabled();
  await page.getByRole('button', { name: 'Убрать выбранный файл', exact: true }).click();
  await expect(page.locator('#chak-map-background-url')).toBeEnabled();
  await page.locator('#chak-map-background-file').setInputFiles(png);
  await page.getByRole('button', { name: 'Создать карту', exact: true }).click();
  await page.waitForURL(/\/maps\/\d+$/);
  const mapId = new URL(page.url()).pathname.split('/').pop();
  const first = await api(page, 'GET', 'chak-maps/' + mapId);
  const oldUrl = first.data.attributes.backgroundUrl;
  expect(new URL(oldUrl, page.url()).pathname).toMatch(/\/background\/[a-f0-9]{32}$/);
  const image = await page.request.get(oldUrl);
  expect(image.status()).toBe(200); expect(image.headers()['content-type']).toBe('image/png');
  expect(image.headers()['cache-control']).toBe('private, no-store');
  await expect(page.locator('.ChakMap-board')).toBeVisible();
  await expect(page.getByPlaceholder('Имя фишки', { exact: true })).toBeVisible();
  await api(page, 'PATCH', 'chak-maps/' + mapId, { gridSize: 80, gridColor: '#123456' });
  await api(page, 'POST', 'chak-maps/' + mapId + '/tokens', { name: 'Retained token', imageUrl: '/smoke-map.svg', ownerUsername: 'smokeadmin' }, 201, 'chak-tokens');
  const before = await api(page, 'GET', 'chak-maps/' + mapId);
  await page.locator('#chak-map-replace-background').setInputFiles(jpeg);
  await expect.poll(async () => (await api(page, 'GET', 'chak-maps/' + mapId)).data.attributes.backgroundUrl).not.toBe(oldUrl);
  await expect(page.locator('#chak-map-replace-background')).toBeEnabled();
  const after = await api(page, 'GET', 'chak-maps/' + mapId);
  expect(after.data.attributes.gridSize).toBe(80); expect(after.data.attributes.gridColor).toBe('#123456');
  expect(after.included).toEqual(before.included);
  expect((await page.request.get(after.data.attributes.backgroundUrl)).headers()['content-type']).toBe('image/jpeg');
  expect((await page.request.get(oldUrl)).status()).toBe(404);
  await page.locator('#chak-map-replace-background').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg/>') });
  await expect(page.locator('.ChakMaps-error')).toContainText('Выберите настоящее изображение');
  expect((await api(page, 'GET', 'chak-maps/' + mapId)).data.attributes.backgroundUrl).toBe(after.data.attributes.backgroundUrl);
  await page.locator('#chak-map-replace-background').setInputFiles(png);
  await expect.poll(async () => (await api(page, 'GET', 'chak-maps/' + mapId)).data.attributes.backgroundUrl).not.toBe(after.data.attributes.backgroundUrl);
  await expect(page.locator('.ChakMaps-error')).toHaveCount(0);
});

test('private uploaded images require a visible linked post; guests and players cannot upload', async ({ page, browser }, testInfo) => {
  await login(page); const png = await raster(page);
  const map = await upload(page, 'chak-maps', png, { title: 'Protected upload ' + Date.now() }, 201);
  const mapId = map.data.id; const url = map.data.attributes.backgroundUrl;
  const username = 'image' + Date.now(); const password = 'Disposable-image-only-9821';
  await api(page, 'POST', 'users', { username, password, email: username + '@example.test', isEmailConfirmed: true }, 201, 'users');
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const guest = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    expect((await guest.request.get(url)).status()).toBe(403);
    const guestPage = await guest.newPage(); await guestPage.goto('/');
    await upload(guestPage, 'chak-maps/' + mapId + '/background', png, {}, 403);
    const player = await context.newPage(); await login(player, username, password);
    expect((await player.request.get(url)).status()).toBe(404);
    await upload(player, 'chak-maps', png, { title: 'Forbidden upload' }, 403);
    await upload(player, 'chak-maps/' + mapId + '/background', png, {}, 403);
    const target = await discussion(page, 'Protected image post');
    await api(page, 'POST', 'chak-map-embeds', { postId: Number(target.id), mapId: Number(mapId) }, 201, 'chak-map-embeds');
    await player.goto(target.url);
    const board = savedPost(player, target.id).locator('.ChakMapEmbed');
    await expect(board.locator('.ChakMap-canvas')).toBeVisible();
    const response = await player.request.get(url); expect(response.status()).toBe(200);
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect((await response.body()).subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
    await api(page, 'PATCH', 'posts/' + target.id, { isHidden: true }, 200, 'posts');
    expect((await player.request.get(url)).status()).toBe(404);
    await api(page, 'PATCH', 'posts/' + target.id, { isHidden: false }, 200, 'posts');
    expect((await player.request.get(url)).status()).toBe(200);
    await api(page, 'DELETE', 'chak-map-embeds/' + target.id);
    expect((await player.request.get(url)).status()).toBe(404);
  } finally { await context.close(); await guest.close(); }
});

test('invalid create does not publish a partial map; an upload network error preserves the draft for explicit retry', async ({ page }) => {
  await login(page); const png = await raster(page);
  const title = 'Rejected image ' + Date.now();
  await upload(page, 'chak-maps', { name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not JPEG') }, { title }, 422);
  expect((await api(page, 'GET', 'chak-maps')).data.some(map => map.attributes.title === title)).toBe(false);
  await page.goto('/maps'); await page.locator('#chak-map-title').fill(title);
  await page.locator('#chak-map-background-file').setInputFiles(png);
  let failures = 0;
  await page.route('**/api/chak-maps', async route => {
    if (route.request().method() === 'POST' && failures++ === 0) await route.fulfill({ status: 503, contentType: 'application/json', body: '{"errors":[{"detail":"Temporary upload failure"}]}' });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Создать карту', exact: true }).click();
  await expect(page.locator('.ChakMaps-error')).toContainText('Temporary upload failure');
  await expect(page.locator('#chak-map-title')).toHaveValue(title);
  await expect(page.locator('#chak-map-background-file').locator('..')).toContainText(png.name);
  await page.getByRole('button', { name: 'Создать карту', exact: true }).click();
  await page.waitForURL(/\/maps\/\d+$/);
  expect(failures).toBe(2);
});

test('a map read begun before background upload cannot restore the old background', async ({ page }) => {
  await login(page); await mapImage(page); const png = await raster(page);
  const mapId = await createMap(page, 'Late read background ' + Date.now());
  await page.goto('/maps/' + mapId);
  await expect(page.locator('.ChakMap-canvas')).toBeVisible();
  let release, captured, hold = true;
  const ready = new Promise(resolve => { captured = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/chak-maps/' + mapId, async route => {
    if (hold && route.request().method() === 'GET') {
      hold = false; const response = await route.fetch(); captured(); await gate; await route.fulfill({ response });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Обновить позиции', exact: true }).click();
  await ready;
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chak-maps/' + mapId + '/background');
  await page.locator('#chak-map-replace-background').setInputFiles(png);
  const uploadResponse = await saved; expect(uploadResponse.status()).toBe(200);
  const expectedUrl = (await uploadResponse.json()).data.attributes.backgroundUrl;
  await expect.poll(() => page.locator('.ChakMap-canvas').evaluate(element => element.style.backgroundImage)).toContain(expectedUrl);
  const lateResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/chak-maps/' + mapId);
  release(); await lateResponse;
  await page.waitForTimeout(150);
  expect(await page.locator('.ChakMap-canvas').evaluate(element => element.style.backgroundImage)).toContain(expectedUrl);
});
