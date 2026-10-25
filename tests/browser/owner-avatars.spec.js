const { test, expect } = require('@playwright/test');
const { login, api, mapImage, createMap } = require('./helpers');

test('owner options show native avatars and initials without mutating shared user records', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await mapImage(page);
  const username = 'avatarowner' + Date.now();
  const created = await api(page, 'POST', 'users', {
    username, email: username + '@example.test', password: 'Disposable-avatar-only-9821', isEmailConfirmed: true,
  }, 201, 'users');
  const mapId = await createMap(page, 'Avatar options ' + Date.now());
  await api(page, 'POST', 'chak-maps/' + mapId + '/tokens', {
    name: 'Avatar token', imageUrl: '/smoke-map.svg', ownerUsername: 'smokeadmin',
  }, 201, 'chak-tokens');
  await page.goto('/maps/' + mapId);
  const input = page.locator('form.ChakMaps-panel').getByRole('combobox');
  await expect(input).toBeVisible();
  await page.evaluate(({ id, username }) => app.store.pushObject({
    type: 'users', id, attributes: { username, displayName: 'Preserved nickname', avatarUrl: '/existing-profile-avatar.svg' },
  }), { id: created.data.id, username });

  // Real API for an account without an uploaded avatar.
  await input.fill(username);
  const option = page.getByRole('option', { name: '@' + username, exact: true });
  await expect(option.locator('span.Avatar')).toHaveText('A');
  const profile = () => page.evaluate(id => {
    const user = app.store.getById('users', id);
    return [user.displayName(), user.avatarUrl()];
  }, created.data.id);
  expect(await profile()).toEqual(['Preserved nickname', '/existing-profile-avatar.svg']);

  // Supply the same public DTO with a controlled image URL; no upload/profile mutation.
  await page.route('**/smoke-avatar.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="teal"/></svg>',
  }));
  const avatarResponse = (avatarUrl) => ({
    data: [{ id: created.data.id, type: 'chak-map-users', attributes: { username, avatarUrl } }],
  });
  await input.fill('');
  await page.route('**/api/chak-map-users?*', route => route.fulfill({
    contentType: 'application/vnd.api+json', json: avatarResponse('/smoke-avatar.svg'),
  }), { times: 1 });
  await input.fill(username);
  const image = option.locator('img.Avatar');
  await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth === 320)).toBe(true);
  expect(await image.evaluate(img => getComputedStyle(img).borderRadius)).toBe('50%');
  expect(await profile()).toEqual(['Preserved nickname', '/existing-profile-avatar.svg']);

  await input.fill('');
  await page.route('**/broken-avatar.svg', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/api/chak-map-users?*', route => route.fulfill({
    contentType: 'application/vnd.api+json', json: avatarResponse('/broken-avatar.svg'),
  }), { times: 1 });
  await input.fill(username);
  await expect(option.locator('span.Avatar')).toHaveText('A');
  await option.click();
  await expect(input).toHaveValue(username);

  await page.getByRole('button', { name: 'Назначить владельца: Avatar token', exact: true }).click();
  const modal = page.locator('.AssignTokenOwnerModal');
  await modal.getByRole('combobox').fill(username);
  await expect(modal.getByRole('option', { name: '@' + username, exact: true }).locator('span.Avatar')).toHaveText('A');
  await modal.getByRole('button', { name: 'Отмена', exact: true }).click();
  expect(errors).toEqual([]);
});
