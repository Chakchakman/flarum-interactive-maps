const { test, expect } = require('@playwright/test');

test('forum and composer work before the map picker is exercised', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto('/');
  expect(response.status()).toBe(200);
  await page.locator('.item-logIn button').click();
  await page.locator('.LogInModal input[name="identification"]').fill('smokeadmin');
  await page.locator('.LogInModal input[name="password"]').fill('Smoke-test-only-9821');
  await page.locator('.LogInModal button[type="submit"]').click();
  await expect(page.locator('.item-logIn')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start a Discussion', exact: true }).click();
  await page.locator('.DiscussionComposer input').first().fill('Runtime smoke discussion');
  await page.locator('.TextEditor textarea').fill('[b]Original smoke post[/b]');
  await expect(page.locator('.TextEditor-controls')).toBeVisible();
  await page.getByRole('button', { name: 'Post Discussion', exact: true }).click();
  await expect(page.locator('.Post-body').first()).toContainText('Original smoke post');
  await expect(page.locator('.Post-body').first().locator('strong, b')).toContainText('Original smoke post');

  await page.locator('.PostStream-item').first().getByRole('button', { name: 'Reply', exact: true }).click();
  await page.locator('.TextEditor textarea').fill('Disposable smoke reply');
  await page.getByRole('button', { name: 'Post Reply', exact: true }).click();
  await expect(page.locator('.Post-body').filter({ hasText: 'Disposable smoke reply' })).toBeVisible();
  expect(errors).toEqual([]);

  const post = page.locator('.CommentPost').filter({ hasText: 'Disposable smoke reply' });
  await post.locator('.Post-controls .Dropdown-toggle').click();
  await page.getByRole('button', { name: 'Прикрепить карту', exact: true }).click();
  await expect(page.locator('.AttachMapModal')).toBeVisible();
  await expect(page.locator('.AttachMapModal')).toContainText('В каталоге пока нет карт.');
  await page.locator('#chak-map-search').fill('Smoke search');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.locator('.AttachMapModal')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.Post-body').first()).toContainText('Original smoke post');
  await expect(page.locator('.Post-body').filter({ hasText: 'Disposable smoke reply' })).toBeVisible();
  expect(errors).toEqual([]);
});
