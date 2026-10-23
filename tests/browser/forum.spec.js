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
  await page.getByRole('textbox', { name: 'Discussion Title' }).fill('Runtime smoke discussion');
  await page.locator('.TextEditor textarea').fill('[b]Original smoke post[/b]\n[interactive-map id=9]');
  await expect(page.locator('.TextEditor-controls')).toBeVisible();
  await page.getByRole('button', { name: 'Post Discussion', exact: true }).click();
  await expect(page.locator('.Post-body').first()).toContainText('Original smoke post');
  await expect(page.locator('.Post-body').first().locator('strong, b')).toContainText('Original smoke post');
  const original = page.locator('.PostStream-item[data-number="1"] .CommentPost');
  await expect(original.locator('.Post-body')).toContainText('[interactive-map id=9]');
  await expect(original.locator('.ChakMapEmbed')).toHaveCount(0);

  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await page.locator('.TextEditor textarea').fill('Disposable smoke reply');
  const savedReply = page.waitForResponse((response) =>
    response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/api/posts'));
  await page.getByRole('button', { name: 'Post Reply', exact: true }).click();
  const replyResponse = await savedReply;
  expect(replyResponse.status()).toBe(201);
  const replyId = (await replyResponse.json()).data.id;
  // Flarum briefly renders both an optimistic preview and the saved reply.
  // Exercise the persisted post, not either copy selected by text alone.
  const post = page.locator(`.PostStream-item[data-id="${replyId}"] .CommentPost`);
  await expect(post).toHaveCount(1);
  await expect(post.locator('.Post-body')).toHaveText('Disposable smoke reply');
  await expect(original.locator('.Post-body')).toContainText('[interactive-map id=9]');
  await expect(original.locator('.ChakMapEmbed')).toHaveCount(0);
  expect(errors).toEqual([]);

  await post.getByRole('button', { name: 'Toggle post controls dropdown menu' }).click();
  await page.getByRole('button', { name: 'Прикрепить карту', exact: true }).click();
  await expect(page.locator('.AttachMapModal')).toBeVisible();
  // Other smoke scenarios retain their fixtures. Empty-catalog behavior is
  // covered separately, so this regression also works on a repeated run.
  await expect(page.locator('#chak-map-search')).toBeVisible();
  await page.locator('#chak-map-search').fill('Smoke search');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.locator('.AttachMapModal')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.Post-body').first()).toContainText('Original smoke post');
  await expect(post.locator('.Post-body')).toHaveText('Disposable smoke reply');
  expect(errors).toEqual([]);
});
