const { expect } = require('@playwright/test');

// Only disposable accounts in the isolated forum; never use a live forum here.
async function login(page, username = 'smokeadmin', password = 'Smoke-test-only-9821') {
  const response = await page.goto('/');
  expect(response.status()).toBe(200);
  await page.locator('.item-logIn button').click();
  await page.locator('.LogInModal input[name="identification"]').fill(username);
  await page.locator('.LogInModal input[name="password"]').fill(password);
  await page.locator('.LogInModal button[type="submit"]').click();
  await expect(page.locator('.item-logIn')).toHaveCount(0);
  await page.waitForFunction(() => !!window.app?.session?.user);
}

async function api(page, method, path, attributes, status = 200, type = 'chak-maps') {
  const csrf = await page.evaluate(() => app.session.csrfToken);
  const response = await page.request.fetch('/api/' + path, {
    method,
    headers: { 'X-CSRF-Token': csrf, Accept: 'application/vnd.api+json' },
    ...(attributes === undefined ? {} : { data: { data: { type, attributes } } }),
  });
  expect(response.status(), method + ' ' + path + ': ' + await response.text()).toBe(status);
  return response.status() === 204 ? null : response.json();
}

function savedPost(page, id) {
  return page.locator('.PostStream-item[data-id="' + id + '"] .CommentPost');
}

async function discussion(page, title, text = '[b]Original smoke post[/b]') {
  await page.getByRole('button', { name: 'Start a Discussion', exact: true }).click();
  await page.getByRole('textbox', { name: 'Discussion Title' }).fill(title + ' ' + Date.now());
  await page.locator('.TextEditor textarea').fill(text);
  await expect(page.locator('.TextEditor-controls')).toBeVisible();
  await page.getByRole('button', { name: 'Post Discussion', exact: true }).click();
  await page.waitForURL(/\/d\/\d/);
  const item = page.locator('.PostStream-item[data-number="1"]');
  await expect(item.locator('.CommentPost .Post-body')).toContainText('Original smoke post');
  return { post: item.locator('.CommentPost'), id: await item.getAttribute('data-id'), url: page.url() };
}

async function openPicker(post, page) {
  await post.getByRole('button', { name: 'Toggle post controls dropdown menu' }).click();
  await page.getByRole('button', { name: 'Прикрепить карту', exact: true }).click();
  const modal = page.locator('.AttachMapModal');
  await expect(modal).toBeVisible();
  return modal;
}

async function mapImage(page) {
  await page.route('**/smoke-map.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#36465d"/></svg>',
  }));
}

async function createMap(page, title) {
  const result = await api(page, 'POST', 'chak-maps', { title, backgroundUrl: '/smoke-map.svg' }, 201);
  return result.data.id;
}

module.exports = { login, api, savedPost, discussion, openPicker, mapImage, createMap };
