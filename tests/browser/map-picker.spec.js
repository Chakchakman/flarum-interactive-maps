const { test, expect } = require('@playwright/test');
const { login, api, savedPost, discussion, openPicker, mapImage, createMap } = require('./helpers');

test.beforeEach(async ({ page }) => {
  page.runtimeErrors = [];
  page.on('pageerror', error => page.runtimeErrors.push(error.message));
  await mapImage(page);
  await login(page);
});

test.afterEach(async ({ page }) => {
  expect(page.runtimeErrors).toEqual([]);
});

test('picker searches Cyrillic titles, IDs and markers; selection is explicit and survives reload', async ({ page }) => {
  const { post, id, url } = await discussion(page, 'Picker search');
  const title = 'Лунный склад ' + Date.now();
  const mapId = await createMap(page, title);
  await createMap(page, 'Forest ' + Date.now());
  let submissions = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/chak-map-embeds') submissions++;
  });
  let modal = await openPicker(post, page);
  await modal.locator('#chak-map-search').fill(title.toLowerCase());
  await expect(modal.locator('.AttachMapModal-map')).toHaveCount(1);
  const row = modal.locator('.AttachMapModal-map');
  await expect(row).toContainText('Лунный склад');
  await expect(row).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => row.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  expect(submissions).toBe(0);
  await modal.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(submissions).toBe(0);
  await api(page, 'GET', 'chak-map-embeds/' + id, undefined, 404);

  modal = await openPicker(post, page);
  await modal.locator('#chak-map-search').fill('no-such-map-' + Date.now());
  await expect(modal).toContainText('Карты не найдены.');
  await modal.locator('#chak-map-search').fill(mapId);
  await expect(modal.locator('.AttachMapModal-map').filter({ hasText: 'Карта #' + mapId })).toHaveCount(1);
  await modal.locator('#chak-map-search').fill('[interactive-map id=' + mapId + ']');
  await modal.getByRole('button', { name: 'Прикрепить карту #' + mapId, exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(submissions).toBe(1);
  await expect(post.locator('.ChakMapEmbed')).toContainText('Лунный склад');
  await expect(post.locator('.Post-body').locator('strong, b')).toHaveText('Original smoke post');
  await page.reload();
  await expect(savedPost(page, id).locator('.ChakMapEmbed')).toContainText('Лунный склад');
  expect(page.url()).toBe(url);

  // Only detach the association created by this test; keep the map and tokens.
  const persisted = savedPost(page, id);
  await persisted.getByRole('button', { name: 'Toggle post controls dropdown menu' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Открепить карту', exact: true }).click();
  await expect(persisted.locator('.ChakMapEmbed')).toHaveCount(0);
  const map = await api(page, 'GET', 'chak-maps/' + mapId);
  expect(map.data.id).toBe(mapId);
  await page.reload();
  await expect(savedPost(page, id).locator('.Post-body').locator('strong, b')).toHaveText('Original smoke post');
  await expect(savedPost(page, id).locator('.ChakMapEmbed')).toHaveCount(0);
});

test('catalog and attachment failures preserve the dialog and retry without duplicate submissions', async ({ page }) => {
  const { post, id } = await discussion(page, 'Picker retry');
  const mapId = await createMap(page, 'Retry map ' + Date.now());
  const catalog = '**/api/chak-maps';
  await page.route(catalog, route => route.fulfill({
    status: 503, contentType: 'application/vnd.api+json',
    json: { errors: [{ status: '503', detail: 'Catalog temporarily unavailable' }] },
  }), { times: 1 });
  const modal = await openPicker(post, page);
  await expect(modal.getByRole('alert')).toContainText('Catalog temporarily unavailable');
  await modal.getByRole('button', { name: 'Повторить загрузку', exact: true }).click();
  await modal.locator('#chak-map-search').fill(mapId);
  const row = modal.locator('.AttachMapModal-map').filter({ hasText: 'Карта #' + mapId });
  await row.click();

  await page.route('**/api/chak-map-embeds', route => route.fulfill({
    status: 503, contentType: 'application/vnd.api+json',
    json: { errors: [{ status: '503', detail: 'Attachment temporarily unavailable' }] },
  }), { times: 1 });
  const submit = modal.getByRole('button', { name: 'Прикрепить карту #' + mapId, exact: true });
  await submit.click();
  await expect(modal.getByRole('alert')).toContainText('Attachment temporarily unavailable');
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await expect(modal.locator('#chak-map-search')).toHaveValue(mapId);
  await api(page, 'GET', 'chak-map-embeds/' + id, undefined, 404);

  let submissions = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/chak-map-embeds') submissions++;
  });
  await submit.dblclick();
  await expect(modal).toHaveCount(0);
  expect(submissions).toBe(1);
  await expect(post.locator('.ChakMapEmbed')).toContainText('Retry map');
});

test('empty catalog supports explicit older IDs; invalid and missing maps never mark a post attached', async ({ page }) => {
  const { post, id } = await discussion(page, 'Picker explicit ID');
  const mapId = await createMap(page, 'Outside current list ' + Date.now());
  // Model a real map outside the API's latest-100 window without creating 101 rows.
  await page.route('**/api/chak-maps', route => route.fulfill({
    contentType: 'application/vnd.api+json', json: { data: [] },
  }));
  const modal = await openPicker(post, page);
  await expect(modal).toContainText('В каталоге пока нет карт.');
  await modal.locator('#chak-map-search').fill('<iframe src="example.test"></iframe>');
  await expect(modal.getByRole('button', { name: 'Выбери карту', exact: true })).toBeDisabled();
  await modal.locator('#chak-map-search').fill('2147483647');
  await modal.getByRole('button', { name: 'Прикрепить карту #2147483647', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Карта не найдена');
  await expect(post.locator('.ChakMapEmbed')).toHaveCount(0);
  await api(page, 'GET', 'chak-map-embeds/' + id, undefined, 404);
  await modal.locator('#chak-map-search').fill('[interactive-map id=' + mapId + ']');
  await modal.getByRole('button', { name: 'Прикрепить карту #' + mapId, exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(post.locator('.ChakMapEmbed')).toContainText('Outside current list');
});
