const { test, expect } = require('@playwright/test');
const { login, api, mapImage, createMap, discussion, rasterFile } = require('./helpers');

async function clipboardImage(page, file) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
  }, file.buffer.toString('base64'));
}
const uploader = (page, id) => page.locator('#' + id).locator('..');

test('token file creation and replacement preserve ownership, coordinates and movement version; images are bounded', async ({ page }) => {
  await login(page); await mapImage(page); const file = await rasterFile(page, 'image/png', 1600, 800);
  const mapId = await createMap(page, 'Token file map ' + Date.now());
  await page.goto('/maps/' + mapId);
  await page.locator('#chak-token-name').fill('Device token');
  await page.locator('#chak-token-owner-new').fill('smokeadmin'); await page.locator('#chak-token-owner-new').press('Tab');
  const chooser = page.waitForEvent('filechooser');
  await uploader(page, 'chak-token-file').getByRole('button', { name: 'Выбрать файл с устройства', exact: true }).click();
  await (await chooser).setFiles(file);
  await expect(page.locator('#chak-token-image')).toBeDisabled();
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const token = page.getByAltText('Device token', { exact: true }); await expect(token).toBeVisible();
  await expect.poll(() => token.evaluate(image => [image.naturalWidth, image.naturalHeight])).toEqual([512, 256]);
  const original = (await api(page, 'GET', 'chak-maps/' + mapId)).included.find(resource => resource.attributes.name === 'Device token');
  expect(original.attributes.imageUrl).toMatch(/\/chak-tokens\/\d+\/image\/[a-f0-9]{32}$/);
  await page.getByRole('button', { name: 'Изменить изображение: Device token', exact: true }).click();
  const modal = page.locator('.UploadTokenImageModal');
  await modal.locator('input[type=file]').setInputFiles(file);
  await modal.getByRole('button', { name: 'Отмена', exact: true }).click();
  expect((await api(page, 'GET', 'chak-maps/' + mapId)).included[0].attributes.imageUrl).toBe(original.attributes.imageUrl);
  await page.getByRole('button', { name: 'Изменить изображение: Device token', exact: true }).click();
  await modal.locator('input[type=file]').setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('<svg/>') });
  await modal.getByRole('button', { name: 'Сохранить изображение', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Выберите настоящее изображение');
  await modal.locator('input[type=file]').setInputFiles(await rasterFile(page, 'image/jpeg'));
  await modal.getByRole('button', { name: 'Сохранить изображение', exact: true }).click();
  await expect(modal).toHaveCount(0);
  const saved = (await api(page, 'GET', 'chak-maps/' + mapId)).included[0];
  const { imageUrl: previousUrl, ...before } = original.attributes;
  const { imageUrl: currentUrl, ...after } = saved.attributes;
  expect(after).toEqual(before); expect(currentUrl).not.toBe(previousUrl);
  expect((await page.request.get(currentUrl)).headers()['content-type']).toBe('image/jpeg');
  expect((await page.request.get(previousUrl)).status()).toBe(404);
});

test('real clipboard button and Ctrl+V work for maps and tokens; denied reads offer fallback and ordinary text paste is untouched', async ({ page }) => {
  await login(page); const file = await rasterFile(page);
  await page.goto('/maps'); await page.locator('#chak-map-title').fill('Clipboard map ' + Date.now());
  await clipboardImage(page, file);
  await uploader(page, 'chak-map-background-file').getByRole('button', { name: 'Вставить изображение из буфера', exact: true }).click();
  await expect(uploader(page, 'chak-map-background-file')).toContainText('clipboard.png');
  await page.getByRole('button', { name: 'Создать карту', exact: true }).click(); await page.waitForURL(/\/maps\/\d+$/);
  await page.locator('#chak-token-name').fill('Pasted token');
  const paste = page.getByRole('textbox', { name: 'Вставить изображение новой фишки из буфера', exact: true });
  await paste.focus(); await page.keyboard.press('Control+V');
  await expect(page.locator('#chak-token-image')).toBeDisabled();
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByAltText('Pasted token', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Изменить изображение: Pasted token', exact: true }).click();
  const modal = page.locator('.UploadTokenImageModal');
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'read', { configurable: true, value: async () => { throw new DOMException('Denied', 'NotAllowedError'); } }));
  await modal.getByRole('button', { name: 'Вставить изображение из буфера', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Ctrl+V');
  await modal.getByRole('textbox', { name: 'Вставить изображение фишки из буфера', exact: true }).focus();
  await page.keyboard.press('Control+V');
  await modal.getByRole('button', { name: 'Сохранить изображение', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a Discussion', exact: true }).click();
  await page.evaluate(() => navigator.clipboard.writeText('[b]Normal forum paste[/b]'));
  await page.locator('.TextEditor textarea').focus(); await page.keyboard.press('Control+V');
  await expect(page.locator('.TextEditor textarea')).toHaveValue('[b]Normal forum paste[/b]');
});

test('token images use map visibility; guests/players cannot upload and detached images are inaccessible', async ({ page, browser }, testInfo) => {
  await login(page); await mapImage(page); const file = await rasterFile(page);
  const mapId = await createMap(page, 'Private token map ' + Date.now());
  const csrf = await page.evaluate(() => app.session.csrfToken);
  const created = await page.request.post('/api/chak-maps/' + mapId + '/tokens', { headers: { 'X-CSRF-Token': csrf }, multipart: { name: 'Private token', image: file } });
  expect(created.status()).toBe(201); const token = (await created.json()).data;
  const username = 'tokenimg' + Date.now(); const password = 'Disposable-token-image-9821';
  await api(page, 'POST', 'users', { username, password, email: username + '@example.test', isEmailConfirmed: true }, 201, 'users');
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const guest = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    expect((await guest.request.get(token.attributes.imageUrl)).status()).toBe(403);
    const player = await context.newPage(); await login(player, username, password);
    expect((await player.request.get(token.attributes.imageUrl)).status()).toBe(404);
    const playerCsrf = await player.evaluate(() => app.session.csrfToken);
    for (const path of ['chak-maps/' + mapId + '/tokens', 'chak-tokens/' + token.id + '/image']) {
      expect((await player.request.post('/api/' + path, { headers: { 'X-CSRF-Token': playerCsrf }, multipart: { name: 'Forbidden token', image: file } })).status()).toBe(403);
    }
    const target = await discussion(page, 'Token image access');
    await api(page, 'POST', 'chak-map-embeds', { postId: Number(target.id), mapId: Number(mapId) }, 201, 'chak-map-embeds');
    expect((await player.request.get(token.attributes.imageUrl)).status()).toBe(200);
    await api(page, 'PATCH', 'posts/' + target.id, { isHidden: true }, 200, 'posts');
    expect((await player.request.get(token.attributes.imageUrl)).status()).toBe(404);
    await api(page, 'PATCH', 'posts/' + target.id, { isHidden: false }, 200, 'posts');
    await api(page, 'DELETE', 'chak-map-embeds/' + target.id);
    expect((await player.request.get(token.attributes.imageUrl)).status()).toBe(404);
  } finally { await context.close(); await guest.close(); }
});
