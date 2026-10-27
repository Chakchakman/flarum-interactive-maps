const { test, expect } = require('@playwright/test');
const { login, api, savedPost, discussion, mapImage, createMap, openPicker } = require('./helpers');

test('composer persists above-text collapsed placement; closed maps fetch nothing and keyboard reveal loads fresh data', async ({ page }) => {
  await login(page); await mapImage(page);
  const mapId = await createMap(page, 'Presentation ' + Date.now());
  await api(page, 'POST', 'chak-maps/' + mapId + '/tokens', {
    name: 'Presentation token', imageUrl: '/smoke-map.svg', ownerUsername: 'smokeadmin',
  }, 201, 'chak-tokens');
  await page.getByRole('button', { name: 'Start a Discussion', exact: true }).click();
  await page.getByRole('textbox', { name: 'Discussion Title' }).fill('Above collapsed ' + Date.now());
  await page.locator('.TextEditor textarea').fill('[b]Presentation text[/b]');
  await page.locator('.Composer').getByRole('button', { name: 'Прикрепить карту', exact: true }).click();
  const modal = page.locator('.AttachMapModal');
  await modal.locator('#chak-map-search').fill(String(mapId));
  await modal.locator('#chak-map-position').selectOption('above');
  await modal.locator('#chak-map-collapsed').selectOption('true');
  await modal.getByRole('button', { name: 'Прикрепить карту #' + mapId, exact: true }).click();
  const reads = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && (/\/api\/chak-map-embeds\/\d+$/.test(path) || path === '/api/chak-map-sync')) reads.push(request.url());
  });
  await page.getByRole('button', { name: 'Post Discussion', exact: true }).click();
  await page.waitForURL(/\/d\/\d/);
  const post = page.locator('.PostStream-item[data-number="1"] .CommentPost');
  const board = post.locator('.ChakMapEmbed');
  const toggle = board.getByRole('button', { name: 'Показать карту', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(board.locator('.ChakMap-board')).toHaveCount(0);
  expect(await post.evaluate(element => {
    const header = element.querySelector('.Post-header');
    const map = element.querySelector('.ChakMapEmbed');
    const text = element.querySelector('.Post-body');
    return !!(header.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING)
      && !!(map.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await page.waitForTimeout(5500);
  expect(reads).toEqual([]);
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(board.getByAltText('Presentation token', { exact: true })).toBeVisible();
  await expect(board.getByRole('button', { name: 'Свернуть карту', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.reload();
  await expect(post.locator('.ChakMapEmbed').getByRole('button', { name: 'Показать карту', exact: true })).toBeVisible();
});

test('post attachment settings preserve text, validate defaults and can be changed only by authorized editable-post staff', async ({ page, browser }, testInfo) => {
  await login(page); await mapImage(page);
  const target = await discussion(page, 'Attachment settings');
  const mapId = await createMap(page, 'Settings map ' + Date.now());
  const modal = await openPicker(savedPost(page, target.id), page);
  await modal.locator('#chak-map-search').fill(String(mapId));
  await expect(modal.locator('#chak-map-position')).toHaveValue('below');
  await expect(modal.locator('#chak-map-collapsed')).toHaveValue('false');
  await modal.getByRole('button', { name: 'Прикрепить карту #' + mapId, exact: true }).click();
  await expect(savedPost(page, target.id).locator('.ChakMapEmbed')).toContainText('Settings map');
  await savedPost(page, target.id).getByRole('button', { name: 'Toggle post controls dropdown menu' }).click();
  await page.getByRole('button', { name: 'Отображение карты', exact: true }).click();
  await modal.locator('#chak-map-position').selectOption('above');
  await modal.locator('#chak-map-collapsed').selectOption('true');
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.reload();
  await expect(savedPost(page, target.id).locator('.Post-body b')).toContainText('Original smoke post');
  await expect(savedPost(page, target.id).locator('.ChakMapEmbed').getByRole('button', { name: 'Показать карту', exact: true })).toBeVisible();
  for (const invalid of [{ displayPosition: 'before' }, { startsCollapsed: 'false' }, { startsCollapsed: 0 }]) {
    await api(page, 'PATCH', 'chak-map-embeds/' + target.id, invalid, 400, 'chak-map-embeds');
  }
  const username = 'present' + Date.now(); const password = 'Disposable-presentation-only-9821';
  await api(page, 'POST', 'users', { username, password, email: username + '@example.test', isEmailConfirmed: true }, 201, 'users');
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const player = await context.newPage(); await mapImage(player); await login(player, username, password);
    await api(player, 'PATCH', 'chak-map-embeds/' + target.id, { displayPosition: 'below' }, 403, 'chak-map-embeds');
    await player.goto(target.url);
    const board = savedPost(player, target.id).locator('.ChakMapEmbed');
    await expect(board.getByRole('button', { name: 'Показать карту', exact: true })).toBeVisible();
    await api(page, 'PATCH', 'posts/' + target.id, { isHidden: true }, 200, 'posts');
    await board.getByRole('button', { name: 'Показать карту', exact: true }).click();
    await expect(board).toContainText('Карта в этом сообщении сейчас недоступна');
    await expect(board.locator('.ChakMap-board')).toHaveCount(0);
    await api(page, 'PATCH', 'posts/' + target.id, { isHidden: false }, 200, 'posts');
  } finally { await context.close(); }
});

test('collapse cancels a local drag, suspends reads and expands with the latest position', async ({ page }) => {
  await login(page); await mapImage(page);
  const target = await discussion(page, 'Collapse lifecycle');
  const mapId = await createMap(page, 'Lifecycle map ' + Date.now());
  const tokenResult = await api(page, 'POST', 'chak-maps/' + mapId + '/tokens', {
    name: 'Lifecycle token', imageUrl: '/smoke-map.svg', ownerUsername: 'smokeadmin',
  }, 201, 'chak-tokens');
  await api(page, 'PATCH', 'chak-maps/' + mapId, { snapToGrid: false });
  await api(page, 'POST', 'chak-map-embeds', { postId: Number(target.id), mapId: Number(mapId) }, 201, 'chak-map-embeds');
  await page.reload();
  const board = savedPost(page, target.id).locator('.ChakMapEmbed');
  const token = board.getByAltText('Lifecycle token', { exact: true });
  await expect(token).toBeVisible();
  let writes = 0; const reads = [];
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/move')) writes++;
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/chak-map-sync') reads.push(request.url());
  });
  const box = await token.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20);
  await board.getByRole('button', { name: 'Свернуть карту', exact: true }).evaluate(button => button.click());
  await page.mouse.up();
  expect(writes).toBe(0);
  const readCount = reads.length; await page.waitForTimeout(5500); expect(reads).toHaveLength(readCount);
  await api(page, 'POST', 'chak-map-embeds/' + target.id + '/tokens/' + tokenResult.data.id + '/move', { x: 0.2, y: 0.3 }, 200, 'chak-tokens');
  await board.getByRole('button', { name: 'Показать карту', exact: true }).click();
  await expect(token).toBeVisible();
  expect(await token.evaluate(img => parseFloat(img.style.left) / 100)).toBeCloseTo(0.2, 4);
});

test('collapse during a pending save keeps exactly one write; reopening waits and late reads never reopen the board', async ({ page }) => {
  await login(page); await mapImage(page);
  const target = await discussion(page, 'Pending collapse');
  const mapId = await createMap(page, 'Pending map ' + Date.now());
  const created = await api(page, 'POST', 'chak-maps/' + mapId + '/tokens', {
    name: 'Pending token', imageUrl: '/smoke-map.svg', ownerUsername: 'smokeadmin',
  }, 201, 'chak-tokens');
  await api(page, 'PATCH', 'chak-maps/' + mapId, { snapToGrid: false });
  await api(page, 'POST', 'chak-map-embeds', { postId: Number(target.id), mapId: Number(mapId) }, 201, 'chak-map-embeds');
  await page.reload();
  const board = savedPost(page, target.id).locator('.ChakMapEmbed');
  const token = board.getByAltText('Pending token', { exact: true });
  await expect(token).toBeVisible();
  let releaseSave, saveCommitted, saved;
  const committed = new Promise(resolve => { saveCommitted = resolve; });
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  let writes = 0, reads = 0;
  await page.route('**/api/chak-map-embeds/' + target.id + '/tokens/' + created.data.id + '/move', async route => {
    writes++;
    const response = await route.fetch(); saved = (await response.json()).data.attributes;
    saveCommitted(); await saveGate; await route.fulfill({ response });
  });
  page.on('request', request => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/chak-map-embeds/' + target.id) reads++;
  });
  const box = await token.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20); await page.mouse.up();
  await committed;
  await board.getByRole('button', { name: 'Свернуть карту', exact: true }).click();
  await board.getByRole('button', { name: 'Показать карту', exact: true }).click();
  await expect(board.getByRole('status')).toContainText('Дожидаемся сохранения');
  expect(reads).toBe(0); expect(writes).toBe(1);
  releaseSave();
  await expect(token).toBeVisible();
  expect(await token.evaluate(img => parseFloat(img.style.left) / 100)).toBeCloseTo(saved.x, 4);
  expect(reads).toBe(1); expect(writes).toBe(1);

  let releaseRead, readCaptured;
  const captured = new Promise(resolve => { readCaptured = resolve; });
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  await page.route('**/api/chak-map-embeds/' + target.id, async route => {
    const response = await route.fetch(); readCaptured(); await readGate; await route.fulfill({ response });
  });
  await board.getByRole('button', { name: 'Свернуть карту', exact: true }).click();
  await board.getByRole('button', { name: 'Показать карту', exact: true }).click();
  await captured;
  await board.getByRole('button', { name: 'Свернуть карту', exact: true }).click();
  const responseArrived = page.waitForResponse(r => new URL(r.url()).pathname === '/api/chak-map-embeds/' + target.id);
  releaseRead(); await responseArrived;
  await expect(board.getByRole('button', { name: 'Показать карту', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(board.locator('.ChakMap-board')).toHaveCount(0);
  expect(writes).toBe(1);
});
