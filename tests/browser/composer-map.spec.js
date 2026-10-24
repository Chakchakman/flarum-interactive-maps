const { test, expect } = require('@playwright/test');
const { login, api, savedPost, mapImage, createMap } = require('./helpers');

async function choose(page, mapId) {
  await page.locator('.ComposerBody').getByRole('button', { name: /^(Прикрепить карту|Карта:)/ }).click();
  const modal = page.locator('.AttachMapModal');
  await modal.locator('#chak-map-search').fill(String(mapId));
  await modal.getByRole('button', { name: 'Прикрепить карту #' + mapId, exact: true }).click();
  await expect(modal).toHaveCount(0);
}

test('new discussion and reply publish selected maps without changing BBCode or creating separate attach requests', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mapImage(page);
  await login(page);
  const mapId = await createMap(page, 'Composer map ' + Date.now());
  let attachRequests = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/chak-map-embeds') attachRequests++;
  });
  await page.getByRole('button', { name: 'Start a Discussion', exact: true }).click();
  const title = 'Composer attachment ' + Date.now();
  await page.getByRole('textbox', { name: 'Discussion Title' }).fill(title);
  await page.locator('.TextEditor textarea').fill('[b]Composer content[/b]');
  await choose(page, mapId);
  await expect(page.locator('.TextEditor textarea')).toHaveValue('[b]Composer content[/b]');
  await expect(page.getByRole('textbox', { name: 'Discussion Title' })).toHaveValue(title);
  // Reopening and cancelling keeps the original selection and draft.
  await page.locator('.ComposerBody').getByRole('button', { name: /^Карта:/ }).click();
  await page.locator('.AttachMapModal').getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.locator('.ComposerBody')).toContainText('Composer map');
  const created = page.waitForResponse(response => response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/discussions');
  await page.getByRole('button', { name: 'Post Discussion', exact: true }).click();
  expect((await created).status()).toBe(201);
  const first = page.locator('.PostStream-item[data-number="1"] .CommentPost');
  await expect(first.locator('.ChakMapEmbed')).toContainText('Composer map');
  await expect(first.locator('.Post-body').locator('strong, b')).toHaveText('Composer content');
  await page.reload();
  await expect(first.locator('.ChakMapEmbed')).toContainText('Composer map');

  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await page.locator('.TextEditor textarea').fill('[b]Reply content[/b]');
  await choose(page, mapId);
  const replied = page.waitForResponse(response => response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/posts');
  await page.getByRole('button', { name: 'Post Reply', exact: true }).click();
  const reply = await replied;
  expect(reply.status()).toBe(201);
  const replyId = (await reply.json()).data.id;
  const post = savedPost(page, replyId);
  await expect(post.locator('.ChakMapEmbed')).toContainText('Composer map');
  await expect(post.locator('.Post-body').locator('strong, b')).toHaveText('Reply content');
  await page.reload();
  await expect(post.locator('.ChakMapEmbed')).toContainText('Composer map');
  expect(attachRequests).toBe(0);
  expect(errors).toEqual([]);
});

test('missing map preserves the draft without publishing a discussion; removing the choice permits normal publication', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Start a Discussion', exact: true }).click();
  const title = 'Failed composer map ' + Date.now();
  await page.getByRole('textbox', { name: 'Discussion Title' }).fill(title);
  await page.locator('.TextEditor textarea').fill('Preserved draft');
  await choose(page, 2147483647);
  const failed = page.waitForResponse(response => response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/discussions');
  await page.getByRole('button', { name: 'Post Discussion', exact: true }).click();
  expect((await failed).status()).toBe(422);
  const alert = page.getByRole('alert').filter({ hasText: 'Карта не найдена' });
  await expect(alert).toBeVisible();
  await expect(page.locator('.TextEditor textarea')).toHaveValue('Preserved draft');
  await expect(page.locator('.ComposerBody')).toContainText('Карта #2147483647');
  const existing = await api(page, 'GET', 'discussions?filter[q]=' + encodeURIComponent(title));
  expect(existing.data.filter(item => item.attributes.title === title)).toHaveLength(0);
  await alert.getByRole('button', { name: 'Dismiss alert', exact: true }).click();
  await page.locator('.ComposerBody').getByRole('button', { name: 'Убрать карту из черновика', exact: true }).click();
  const published = page.waitForResponse(response => response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/discussions');
  await page.getByRole('button', { name: 'Post Discussion', exact: true }).click();
  expect((await published).status()).toBe(201);
  await expect(page.locator('.PostStream-item[data-number="1"] .CommentPost .Post-body')).toHaveText('Preserved draft');
  await expect(page.locator('.ChakMapEmbed')).toHaveCount(0);
});
