const { test, expect } = require('@playwright/test');
const { login, api, savedPost, discussion, mapImage, createMap } = require('./helpers');

test('player moves only their assigned token in a visible embed, including at 200% zoom', async ({ page, browser }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mapImage(page);
  await login(page);
  const { id: postId, url } = await discussion(page, 'Player permissions');
  const mapId = await createMap(page, 'Player map ' + Date.now());
  await api(page, 'PATCH', 'chak-maps/' + mapId, { snapToGrid: false });
  const username = 'player' + Date.now();
  const password = 'Disposable-player-only-9821';
  const user = await api(page, 'POST', 'users', {
    username, password, email: username + '@example.test', isEmailConfirmed: true,
  }, 201, 'users');
  expect(user.data.attributes.isEmailConfirmed).toBe(true);
  const own = await api(page, 'POST', 'chak-maps/' + mapId + '/tokens', {
    name: 'Owned token', imageUrl: '/smoke-map.svg', ownerUsername: username,
  }, 201, 'chak-tokens');
  const other = await api(page, 'POST', 'chak-maps/' + mapId + '/tokens', {
    name: 'Someone else token', imageUrl: '/smoke-map.svg', ownerUsername: 'smokeadmin',
  }, 201, 'chak-tokens');
  await api(page, 'POST', 'chak-map-embeds', { postId: Number(postId), mapId: Number(mapId) }, 201, 'chak-map-embeds');
  await api(page, 'POST', 'chak-map-embeds/' + postId + '/tokens/' + other.data.id + '/move', { x: 0.75, y: 0.75 }, 200, 'chak-tokens');

  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const player = await context.newPage();
    player.on('pageerror', error => errors.push(error.message));
    await mapImage(player);
    await login(player, username, password);
    await player.goto(url);
    const post = savedPost(player, postId);
    const embed = post.locator('.ChakMapEmbed');
    await expect(embed).toContainText('Player map');
    await expect(player.getByRole('link', { name: '🗺 Карты', exact: true })).toHaveCount(0);
    await expect(post.locator('.item-chakAttachMap, .item-chakDetachMap')).toHaveCount(0);
    await expect(embed.getByAltText('Owned token', { exact: true })).toHaveClass(/is-mine/);
    await expect(embed.getByAltText('Someone else token', { exact: true })).not.toHaveClass(/is-mine/);
    await api(player, 'GET', 'chak-maps', undefined, 403);
    await api(player, 'GET', 'chak-map-users?prefix=smo', undefined, 403);
    await api(player, 'GET', 'chak-maps/' + mapId, undefined, 403);
    await api(player, 'POST', 'chak-map-embeds', { postId: Number(postId), mapId: Number(mapId) }, 403, 'chak-map-embeds');
    await api(player, 'POST', 'discussions', {
      title: 'Forged draft map ' + Date.now(), content: 'Must not publish',
      chakMapId: Number(mapId),
    }, 403, 'discussions');
    await api(player, 'POST', 'chak-tokens/' + own.data.id + '/move', { x: 0.1, y: 0.1 }, 403, 'chak-tokens');
    // Body fields cannot turn another token into this player's token.
    await api(player, 'POST', 'chak-map-embeds/' + postId + '/tokens/' + other.data.id + '/move', {
      x: 0.1, y: 0.1, ownerUserId: Number(user.data.id), mapId: Number(mapId), postId: Number(postId),
    }, 403, 'chak-tokens');

    const slider = embed.getByRole('slider', { name: 'Масштаб игровой карты' });
    await slider.fill('200');
    await slider.dispatchEvent('input');
    await expect(embed.locator('.ChakMap-zoomValue')).toHaveText('200%');
    const token = embed.getByAltText('Owned token', { exact: true });
    await token.scrollIntoViewIfNeeded();
    const box = await token.boundingBox();
    expect(box).not.toBeNull();
    const moved = player.waitForResponse(response =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/chak-map-embeds/' + postId + '/tokens/' + own.data.id + '/move');
    await player.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await player.mouse.down();
    await player.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 25, { steps: 5 });
    await player.mouse.up();
    const movedResponse = await moved;
    expect(movedResponse.status()).toBe(200);
    const coords = (await movedResponse.json()).data.attributes;
    expect(coords.x).toBeGreaterThan(0.5);
    expect(coords.y).toBeGreaterThan(0.5);
    await player.reload();
    await expect.poll(() => token.evaluate(img => parseFloat(img.style.left))).toBeCloseTo(coords.x * 100, 4);
    await expect.poll(() => token.evaluate(img => parseFloat(img.style.top))).toBeCloseTo(coords.y * 100, 4);
    const reloaded = await api(player, 'GET', 'chak-map-embeds/' + postId);
    const unchanged = reloaded.included.find(item => item.id === other.data.id);
    expect(unchanged.attributes.x).toBe(0.75);
    expect(unchanged.attributes.y).toBe(0.75);

    // Guessing another saved but unlinked post must not expose or move this map.
    await page.goto('/');
    const unlinked = await discussion(page, 'Unlinked post');
    await api(player, 'GET', 'chak-map-embeds/' + unlinked.id, undefined, 404);
    await api(player, 'POST', 'chak-map-embeds/' + unlinked.id + '/tokens/' + own.data.id + '/move', {
      x: 0.2, y: 0.2,
    }, 404, 'chak-tokens');
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
