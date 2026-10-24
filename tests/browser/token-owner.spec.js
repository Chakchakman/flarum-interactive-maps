const { test, expect } = require('@playwright/test');
const { login, api, mapImage, createMap } = require('./helpers');

async function user(page, username) {
  return api(page, 'POST', 'users', {
    username, email: username.replace(/[^\w]/g, 'u') + '@example.test',
    password: 'Disposable-owner-only-9821', isEmailConfirmed: true,
  }, 201, 'users');
}

test('staff owner search starts at three characters, limits results, and assigns/reassigns without losing tokens', async ({ page, browser }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await mapImage(page);
  const stamp = Date.now();
  for (let i = 0; i < 12; i++) await user(page, 'tok' + stamp + 'a' + String(i).padStart(2, '0'));
  const firstName = 'tok' + stamp + 'a00';
  const secondName = 'tok' + stamp + 'a01';
  const options = await api(page, 'GET', 'chak-map-users?prefix=tok');
  expect(options.data).toHaveLength(10);
  for (const item of options.data) {
    expect(item.attributes.username.toLowerCase().startsWith('tok')).toBe(true);
    expect(Object.keys(item.attributes)).toEqual(['username']);
  }
  expect((await api(page, 'GET', 'chak-map-users?prefix=to')).data).toEqual([]);
  expect((await api(page, 'GET', 'chak-map-users?prefix=to_')).data).toEqual([]);
  expect((await api(page, 'GET', 'chak-map-users?prefix=%25__')).data).toEqual([]);
  expect((await api(page, 'GET', 'chak-map-users?prefix=ToK')).data).toHaveLength(10);
  expect((await api(page, 'GET', 'chak-map-users?prefix=' + encodeURIComponent('юша'))).data).toEqual([]);
  const guest = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    expect((await guest.request.get('/api/chak-map-users?prefix=tok')).status()).toBe(403);
  } finally { await guest.close(); }

  const mapId = await createMap(page, 'Owner selection ' + stamp);
  await page.goto('/maps/' + mapId);
  await expect(page.getByRole('heading', { name: 'Owner selection ' + stamp })).toBeVisible();
  const form = page.locator('form.ChakMaps-panel');
  await form.getByLabel('Имя', { exact: true }).fill('Owner test token');
  await form.getByLabel('Адрес PNG/JPG', { exact: true }).fill('/smoke-map.svg');
  const input = form.getByRole('combobox');
  let requests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/chak-map-users') requests++;
  });
  await input.fill('to');
  // Wait longer than the debounce to prove two characters never schedule a lookup.
  await page.waitForTimeout(350);
  expect(requests).toBe(0);
  await input.fill('tok');
  await expect(form.getByRole('option')).toHaveCount(10);
  await input.press('ArrowUp');
  await expect(form.getByRole('option').nth(9)).toHaveAttribute('aria-selected', 'true');
  await input.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.fill(firstName);
  await form.getByRole('option', { name: '@' + firstName, exact: true }).click();
  await expect(input).toHaveValue(firstName);
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await form.getByRole('button', { name: 'Добавить', exact: true }).click();
  const row = page.locator('.ChakMap-tokenRow').filter({ hasText: 'Owner test token' });
  await expect(row).toContainText('@' + firstName);
  const ownerButton = row.getByRole('button', { name: 'Назначить владельца: Owner test token', exact: true });
  await ownerButton.click();
  let modal = page.locator('.AssignTokenOwnerModal');
  await modal.getByRole('combobox').fill('missingowner' + stamp);
  await modal.getByRole('button', { name: 'Сохранить владельца', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Пользователь Flarum не найден');
  await expect(row).toContainText('@' + firstName);
  await modal.getByRole('button', { name: 'Отмена', exact: true }).click();
  await ownerButton.click();
  modal = page.locator('.AssignTokenOwnerModal');
  await modal.getByRole('combobox').fill(secondName);
  await expect(modal.getByRole('option')).toHaveCount(1);
  await modal.getByRole('combobox').press('ArrowDown');
  await modal.getByRole('combobox').press('Enter');
  await expect(modal.getByRole('combobox')).toHaveValue(secondName);
  await modal.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(row).toContainText('@' + firstName);
  await ownerButton.click();
  modal = page.locator('.AssignTokenOwnerModal');
  await modal.getByRole('combobox').fill(secondName);
  await modal.getByRole('option', { name: '@' + secondName, exact: true }).click();
  await modal.getByRole('button', { name: 'Сохранить владельца', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(row).toContainText('@' + secondName);
  await page.reload();
  await expect(row).toContainText('@' + secondName);
  await ownerButton.click();
  modal = page.locator('.AssignTokenOwnerModal');
  await modal.getByRole('combobox').fill('');
  await modal.getByRole('button', { name: 'Сохранить владельца', exact: true }).click();
  await expect(row).toContainText('Без владельца');
  await expect(row).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('search and assignment errors allow retry; a late search cannot replace current suggestions', async ({ page }) => {
  await login(page);
  await mapImage(page);
  const username = 'retryowner' + Date.now();
  await user(page, username);
  const mapId = await createMap(page, 'Owner retry ' + Date.now());
  const token = await api(page, 'POST', 'chak-maps/' + mapId + '/tokens', {
    name: 'Retry owner token', imageUrl: '/smoke-map.svg', ownerUsername: 'smokeadmin',
  }, 201, 'chak-tokens');
  await page.goto('/maps/' + mapId);
  const row = page.locator('.ChakMap-tokenRow').filter({ hasText: 'Retry owner token' });
  await row.getByRole('button', { name: 'Назначить владельца: Retry owner token', exact: true }).click();
  const modal = page.locator('.AssignTokenOwnerModal');
  const input = modal.getByRole('combobox');
  await page.route('**/api/chak-map-users?*', route => route.fulfill({
    status: 503, contentType: 'application/vnd.api+json',
    json: { errors: [{ detail: 'Search temporarily unavailable' }] },
  }), { times: 1 });
  await input.fill('retry');
  await expect(modal.getByRole('alert')).toContainText('Search temporarily unavailable');
  await input.fill(username);
  await modal.getByRole('option', { name: '@' + username, exact: true }).click();
  await page.route('**/api/chak-tokens/' + token.data.id + '/owner', route => route.fulfill({
    status: 503, contentType: 'application/vnd.api+json',
    json: { errors: [{ detail: 'Assignment temporarily unavailable' }] },
  }), { times: 1 });
  await modal.getByRole('button', { name: 'Сохранить владельца', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Assignment temporarily unavailable');
  await expect(input).toHaveValue(username);
  await expect(row).toContainText('@smokeadmin');
  await modal.getByRole('button', { name: 'Сохранить владельца', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(row).toContainText('@' + username);

  await row.getByRole('button', { name: 'Назначить владельца: Retry owner token', exact: true }).click();
  let release;
  let started = false;
  const delayed = new Promise(resolve => { release = resolve; });
  await page.route('**/api/chak-map-users?prefix=old', async route => {
    started = true;
    await delayed;
    await route.fulfill({ contentType: 'application/vnd.api+json', json: {
      data: [{ id: '999999', type: 'chak-map-users', attributes: { username: 'old-obsolete-result' } }],
    } });
  });
  await input.fill('old');
  await expect.poll(() => started).toBe(true);
  await input.fill(username);
  await expect(modal.getByRole('option', { name: '@' + username, exact: true })).toBeVisible();
  const lateResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/chak-map-users' &&
    new URL(response.url()).searchParams.get('prefix') === 'old');
  release();
  await (await lateResponse).finished();
  // Flush the rendering frames after the old HTTP response was fully delivered.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(modal.getByRole('option', { name: '@' + username, exact: true })).toBeVisible();
  await expect(modal.getByRole('option', { name: '@old-obsolete-result', exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Отмена', exact: true }).click();
});
