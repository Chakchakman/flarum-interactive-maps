const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { login, api, savedPost, discussion, mapImage, createMap } = require('./helpers');

async function fixture(page, owner = 'smokeadmin') {
  await mapImage(page);
  const target = await discussion(page, 'Conflict fixture');
  const mapId = await createMap(page, 'Conflict map ' + Date.now());
  await api(page, 'PATCH', 'chak-maps/' + mapId, { snapToGrid: false });
  const created = await api(page, 'POST', 'chak-maps/' + mapId + '/tokens', {
    name: 'Conflict race token ' + Date.now(), imageUrl: '/smoke-map.svg', ownerUsername: owner,
  }, 201, 'chak-tokens');
  await api(page, 'POST', 'chak-map-embeds', { postId: Number(target.id), mapId: Number(mapId) }, 201, 'chak-map-embeds');
  const result = { ...target, mapId, tokenId: created.data.id };
  const read = await current(page, result);
  expect(read.moveVersion).toBe(created.data.attributes.moveVersion);
  return result;
}
async function current(page, target) {
  const snapshot = await api(page, 'GET', 'chak-map-embeds/' + target.id);
  return snapshot.included.find(item => item.id === target.tokenId).attributes;
}
const routeFor = target => 'chak-map-embeds/' + target.id + '/tokens/' + target.tokenId + '/move';
async function rawMove(page, route, attributes) {
  return page.request.post('/api/' + route, {
    headers: { 'X-CSRF-Token': await page.evaluate(() => app.session.csrfToken) },
    data: { data: { type: 'chak-tokens', attributes } },
  });
}

test('both movement routes require the observed state and stale writes never overwrite a committed move', async ({ page }) => {
  await login(page); const target = await fixture(page);
  const legacy = 'chak-tokens/' + target.tokenId + '/move';
  const base = await current(page, target);
  expect(base.moveVersion).toMatch(/^[a-f0-9]{64}$/);
  for (const route of [routeFor(target), legacy]) {
    await api(page, 'POST', route, { x: 0.2, y: 0.3 }, 428, 'chak-tokens');
    await api(page, 'POST', route, { x: 0.2, y: 0.3, moveVersion: 'invalid' }, 428, 'chak-tokens');
  }
  const accepted = await api(page, 'POST', routeFor(target), { x: 0.2, y: 0.3, moveVersion: base.moveVersion }, 200, 'chak-tokens');
  expect(accepted.data.attributes.moveVersion).not.toBe(base.moveVersion);
  const conflict = await api(page, 'POST', legacy, { x: 0.8, y: 0.9, moveVersion: base.moveVersion }, 409, 'chak-tokens');
  expect(conflict.errors[0].code).toBe('token_move_conflict');
  expect(conflict.errors[0].meta.currentToken.id).toBe(target.tokenId);
  expect(conflict.errors[0].meta.currentToken.attributes).toMatchObject({ x: 0.2, y: 0.3, moveVersion: accepted.data.attributes.moveVersion });
  expect(await current(page, target)).toMatchObject({ x: 0.2, y: 0.3 });
  const retried = await api(page, 'POST', legacy, { x: 0.6, y: 0.7, moveVersion: accepted.data.attributes.moveVersion }, 200, 'chak-tokens');
  expect(retried.data.attributes).toMatchObject({ x: 0.6, y: 0.7 });
  const batch = await api(page, 'GET', 'chak-map-sync?postIds=' + target.id);
  expect(batch.data[0].attributes.tokens[0].moveVersion).toBe(retried.data.attributes.moveVersion);
  // Raw JSON preserves -0.0; JSON.stringify would silently turn it into 0.
  const zero = await page.request.post('/api/' + legacy, {
    headers: { 'X-CSRF-Token': await page.evaluate(() => app.session.csrfToken), 'Content-Type': 'application/json' },
    data: '{"data":{"type":"chak-tokens","attributes":{"x":-0.0,"y":1,"moveVersion":"' + retried.data.attributes.moveVersion + '"}}}',
  });
  expect(zero.status(), await zero.text()).toBe(200);
  const zeroState = (await zero.json()).data.attributes;
  const afterZero = await current(page, target);
  expect(afterZero).toMatchObject({ x: 0, y: 1 });
  expect(afterZero.moveVersion).toBe(zeroState.moveVersion);
  const fractional = await api(page, 'POST', legacy, {
    x: 0.30000000000000004, y: 0.3333333333333333, moveVersion: afterZero.moveVersion,
  }, 200, 'chak-tokens');
  const stored = await current(page, target);
  expect(stored.moveVersion).toBe(fractional.data.attributes.moveVersion);
  expect(stored.x).toBe(fractional.data.attributes.x);
  await api(page, 'POST', legacy, { x: 0.4, y: 0.5, moveVersion: fractional.data.attributes.moveVersion }, 200, 'chak-tokens');
});

test('competing clients have one winner across staff and post routes, including rapid state transitions', async ({ page, browser }, testInfo) => {
  await login(page); const username = 'race' + Date.now(); const password = 'Disposable-race-only-9821';
  await api(page, 'POST', 'users', { username, password, email: username + '@example.test', isEmailConfirmed: true }, 201, 'users');
  const target = await fixture(page, username);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const player = await context.newPage(); await login(player, username, password);
    for (let round = 0; round < 4; round++) {
      const base = await current(page, target);
      const destinations = [{ x: 0.125 + round / 16, y: 0.25 }, { x: 0.875 - round / 16, y: 0.75 }];
      const responses = await Promise.all([
        rawMove(page, 'chak-tokens/' + target.tokenId + '/move', { ...destinations[0], moveVersion: base.moveVersion }),
        rawMove(player, routeFor(target), { ...destinations[1], moveVersion: base.moveVersion }),
      ]);
      expect(responses.map(r => r.status()).sort()).toEqual([200, 409]);
      const winner = responses.findIndex(r => r.status() === 200);
      const loser = await responses[1 - winner].json();
      expect(loser.errors[0].meta.currentToken.attributes).toMatchObject(destinations[winner]);
      expect(await current(page, target)).toMatchObject(destinations[winner]);
    }
  } finally { await context.close(); }
});

test('a stale pointer drag adopts the authoritative position and can be repeated without a global alert', async ({ page, browser }, testInfo) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await login(page); const target = await fixture(page);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const other = await context.newPage(); await login(other);
    await page.goto(target.url);
    const board = savedPost(page, target.id).locator('.ChakMapEmbed');
    const token = board.getByAltText(/^Conflict race token/);
    await expect(token).toBeVisible();
    const drag = async (dx, dy, expected) => {
      const box = await token.boundingBox();
      const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/' + routeFor(target));
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 3 });
      return { response, finish: async () => { await page.mouse.up(); const r = await response; expect(r.status()).toBe(expected); return r.json(); } };
    };
    // Hold a genuine drag, so background sync cannot replace the displayed base.
    const pending = await drag(35, 20, 409);
    await api(other, 'POST', 'chak-tokens/' + target.tokenId + '/move', { x: 0.75, y: 0.65, moveVersion: (await current(other, target)).moveVersion }, 200, 'chak-tokens');
    await pending.finish();
    await expect(board).toContainText('Фишка уже изменена в другом окне');
    await expect.poll(() => token.evaluate(img => parseFloat(img.style.left))).toBeCloseTo(75, 4);
    expect(await current(page, target)).toMatchObject({ x: 0.75, y: 0.65 });
    const retried = await drag(-25, -15, 200); await retried.finish();
    await expect(board).not.toContainText('Фишка уже изменена в другом окне');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

// A DB lock makes the reassignment race deterministic, rather than hoping two
// HTTP requests overlap. The helper refuses non-disposable forums/tokens.
test('ownership is checked after acquiring the token lock, even when reassigned while the move waits', async ({ page, browser }, testInfo) => {
  await login(page); const username = 'race' + Date.now(); const password = 'Disposable-race-only-9821';
  await api(page, 'POST', 'users', { username, password, email: username + '@example.test', isEmailConfirmed: true }, 201, 'users');
  const target = await fixture(page, username);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const root = process.env.MAPS_FORUM_ROOT;
  expect(root, 'Isolated fixture forum root is required').toBeTruthy();
  const script = path.join(__dirname, 'lock-token-fixture.php');
  const dockerImage = process.env.MAPS_FIXTURE_PHP_DOCKER;
  const child = dockerImage
    ? spawn('docker', ['run', '--rm', '--pull=never', '-i', '--network', 'host', '--user', '1000:1000', '-v', '/workspace:/workspace', '-w', root, dockerImage, 'php', script, root, target.tokenId, '--isolated-forum'])
    : spawn('php', [script, root, target.tokenId, '--isolated-forum']);
  let output = '', stderr = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { stderr += data; console.error('Lock fixture:', data.toString()); });
  const exited = new Promise(resolve => { child.on('error', error => { stderr += error.message; resolve(-1); }); child.on('exit', resolve); });
  const wait = marker => expect.poll(() => ({ output, stderr }), { timeout: 15000 }).toMatchObject({ output: expect.stringContaining(marker) });
  try {
    const player = await context.newPage(); await login(player, username, password);
    const base = await current(page, target);
    await wait('LOCKED');
    const movement = rawMove(player, routeFor(target), { x: 0.9, y: 0.1, moveVersion: base.moveVersion });
    child.stdin.write('WAIT\n'); await wait('WAITING');
    child.stdin.write('COMMIT\n'); await wait('COMMITTED');
    const response = await movement;
    expect(response.status(), await response.text()).toBe(403);
    const body = await response.json(); expect(body.errors[0].meta).toBeUndefined();
    expect(await current(page, target)).toMatchObject({ x: base.x, y: base.y, ownerUsername: 'smokeadmin' });
    expect(await exited, stderr).toBe(0);
  } finally { child.stdin.end(); const code = await exited; if (code !== 0) console.error('Lock fixture failed:', output, stderr); await context.close(); }
});

for (const view of ['post', 'editor']) {
  test('a conflict cancels a newer active drag without replaying stale intent in the ' + view, async ({ page, browser }, testInfo) => {
    await login(page); const target = await fixture(page);
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    try {
      const other = await context.newPage(); await login(other);
      await page.goto(view === 'post' ? target.url : '/maps/' + target.mapId);
      const token = page.locator('.ChakMap-board').getByAltText(/^Conflict race token/);
      await expect(token).toBeVisible();
      const route = view === 'post' ? routeFor(target) : 'chak-tokens/' + target.tokenId + '/move';
      let captured, count = 0;
      const held = new Promise(resolve => { captured = resolve; });
      await page.route('**/api/' + route, async intercept => {
        count++;
        if (count === 1) { captured(); await gate; }
        await intercept.continue();
      });
      const gesture = async (dx, dy, up = true) => {
        const box = await token.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 3 });
        if (up) await page.mouse.up();
      };
      const first = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/' + route);
      await gesture(25, 15); await held;
      await api(other, 'POST', routeFor(target), { x: 0.3, y: 0.35 }, 200, 'chak-tokens');
      await gesture(30, 15, false);
      await expect(token).toHaveClass(/is-dragging/);
      release(); expect((await first).status()).toBe(409);
      await expect(token).not.toHaveClass(/is-dragging/);
      await expect.poll(() => token.evaluate(img => parseFloat(img.style.left))).toBeCloseTo(30, 4);
      await page.mouse.up(); await page.waitForTimeout(300);
      expect(count).toBe(1);
      expect(await current(page, target)).toMatchObject({ x: 0.3, y: 0.35 });
      await expect(page.getByText(/Фишка уже изменена в другом окне/)).toBeVisible();
      const retry = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/' + route);
      await gesture(-10, 10); expect((await retry).status()).toBe(200);
      expect(count).toBe(2);
      await expect(page.getByRole('alert')).toHaveCount(0);
    } finally { release(); await context.close(); }
  });
}
