const { test, expect } = require('@playwright/test');
const { login, api, savedPost, discussion, mapImage, createMap } = require('./helpers');
const isSync = response => new URL(response.url()).pathname === '/api/chak-map-sync';
const position = async token => token.evaluate(img => ({ x: parseFloat(img.style.left) / 100, y: parseFloat(img.style.top) / 100 }));

async function fixture(page, owner = 'smokeadmin') {
  await mapImage(page);
  const target = await discussion(page, 'Auto sync map');
  const mapId = await createMap(page, 'Auto sync ' + Date.now());
  await api(page, 'PATCH', 'chak-maps/' + mapId, { snapToGrid: false });
  const token = await api(page, 'POST', 'chak-maps/' + mapId + '/tokens', {
    name: 'Sync token', imageUrl: '/smoke-map.svg', ownerUsername: owner,
  }, 201, 'chak-tokens');
  await api(page, 'POST', 'chak-map-embeds', { postId: Number(target.id), mapId: Number(mapId) }, 201, 'chak-map-embeds');
  await page.reload();
  await expect(savedPost(page, target.id).locator('.ChakMapEmbed')).toContainText('Auto sync');
  return { ...target, mapId, tokenId: token.data.id };
}

async function move(page, target, x, y) {
  await api(page, 'POST', 'chak-map-embeds/' + target.id + '/tokens/' + target.tokenId + '/move', { x, y }, 200, 'chak-tokens');
}

test('a second client receives movement and ownership automatically; hidden map snapshots reveal nothing', async ({ page, browser }, testInfo) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await login(page);
  const username = 'sync' + Date.now(); const password = 'Disposable-sync-only-9821';
  await api(page, 'POST', 'users', { username, password, email: username + '@example.test', isEmailConfirmed: true }, 201, 'users');
  const target = await fixture(page, username);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const player = await context.newPage(); player.on('pageerror', e => errors.push(e.message));
    await mapImage(player); await login(player, username, password); await player.goto(target.url);
    const board = savedPost(player, target.id).locator('.ChakMapEmbed');
    const token = board.getByAltText('Sync token', { exact: true });
    await expect(token).toHaveClass(/is-mine/);
    await move(page, target, 0.3, 0.4);
    await expect.poll(async () => (await position(token)).x, { timeout: 15000 }).toBeCloseTo(0.3, 4);
    await expect.poll(async () => (await position(token)).y).toBeCloseTo(0.4, 4);
    await api(page, 'PATCH', 'chak-tokens/' + target.tokenId + '/owner', { ownerUsername: 'smokeadmin' }, 200, 'chak-tokens');
    await expect(token).not.toHaveClass(/is-mine/, { timeout: 15000 });
    const mixed = await api(player, 'GET', 'chak-map-sync?postIds=' + target.id + ',2147483647');
    expect(mixed.data[0].attributes.mapId).toBe(Number(target.mapId));
    expect(mixed.data[1].attributes).toEqual({ available: false });
    for (const query of ['', '0', '-1', '1,', Array.from({ length: 21 }, (_, i) => i + 1).join(',')]) {
      await api(player, 'GET', 'chak-map-sync?postIds=' + query, undefined, 400);
    }
    const guest = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    try { expect((await guest.request.get('/api/chak-map-sync?postIds=' + target.id)).status()).toBe(403); }
    finally { await guest.close(); }
    await api(page, 'PATCH', 'posts/' + target.id, { isHidden: true }, 200, 'posts');
    await expect(board).toContainText('Карта в этом сообщении сейчас недоступна', { timeout: 15000 });
    await expect(token).toHaveCount(0);
    const denied = await api(player, 'GET', 'chak-map-sync?postIds=' + target.id);
    expect(denied.data[0].attributes).toEqual({ available: false });
    await api(page, 'PATCH', 'posts/' + target.id, { isHidden: false }, 200, 'posts');
    await expect(token).toBeVisible({ timeout: 15000 });
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('visible maps share a batch; background and offscreen boards suspend polling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 2400 });
  await login(page); const target = await fixture(page);
  const discussionId = new URL(target.url).pathname.match(/\/d\/(\d+)/)[1];
  const reply = await api(page, 'POST', 'posts', { content: 'Second sync board' }, 201, 'posts', {
    discussion: { data: { type: 'discussions', id: discussionId } },
  });
  await api(page, 'POST', 'chak-map-embeds', { postId: Number(reply.data.id), mapId: Number(target.mapId) }, 201, 'chak-map-embeds');
  const batches = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/chak-map-sync') batches.push(new URL(request.url()).searchParams.get('postIds').split(',')); });
  await page.reload();
  await expect(page.locator('.ChakMapEmbed')).toHaveCount(2);
  await expect.poll(() => batches.some(ids => ids.includes(target.id) && ids.includes(reply.data.id)), { timeout: 15000 }).toBe(true);
  // Control the document-hidden signal in headless Chromium; actual tab/device
  // behavior remains a manual acceptance item, not inferred from emulation.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenCount = batches.length;
  await page.waitForTimeout(6000);
  expect(batches).toHaveLength(hiddenCount);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => batches.length, { timeout: 10000 }).toBeGreaterThan(hiddenCount);
  await page.evaluate(() => {
    const spacer = document.createElement('div'); spacer.id = 'sync-fixture-spacer'; spacer.style.height = '5000px';
    document.querySelector('.PostStream').prepend(spacer); window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500); // allow real IntersectionObserver delivery
  const offscreenCount = batches.length;
  await page.waitForTimeout(6000);
  expect(batches).toHaveLength(offscreenCount);
  await page.evaluate(() => document.getElementById('sync-fixture-spacer').remove());
  await expect.poll(() => batches.length, { timeout: 15000 }).toBeGreaterThan(offscreenCount);
});

test('a late snapshot never rolls back a completed local drag; transient failures preserve the board and retry', async ({ page }) => {
  await login(page); const target = await fixture(page);
  const board = savedPost(page, target.id).locator('.ChakMapEmbed');
  const token = board.getByAltText('Sync token', { exact: true });
  let release, captured;
  const held = new Promise(resolve => { captured = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let holdNext = true, failNext = false;
  await page.route('**/api/chak-map-sync?*', async route => {
    if (holdNext) {
      holdNext = false; const response = await route.fetch(); const body = await response.json();
      captured(); await gate; await route.fulfill({ response, json: body });
    } else if (failNext) {
      failNext = false; await route.fulfill({ status: 503, contentType: 'application/json', body: '{"errors":[{"status":"503"}]}' });
    } else await route.continue();
  });
  await held;
  const box = await token.boundingBox();
  const saved = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/tokens/' + target.tokenId + '/move'));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 20, { steps: 5 }); await page.mouse.up();
  const response = await saved; expect(response.status()).toBe(200);
  const coords = (await response.json()).data.attributes; expect(coords.x).toBeGreaterThan(0.5);
  const late = page.waitForResponse(isSync); release(); await late;
  await page.waitForTimeout(300);
  expect((await position(token)).x).toBeCloseTo(coords.x, 4);
  expect((await position(token)).y).toBeCloseTo(coords.y, 4);
  failNext = true;
  await expect(board.getByRole('status')).toContainText('Повторяем автоматически', { timeout: 15000 });
  await expect(token).toBeVisible();
  expect((await position(token)).x).toBeCloseTo(coords.x, 4);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await move(page, target, 0.8, 0.2);
  await expect.poll(async () => (await position(token)).x, { timeout: 20000 }).toBeCloseTo(0.8, 4);
  await expect(board.getByRole('status')).toHaveCount(0);
});
