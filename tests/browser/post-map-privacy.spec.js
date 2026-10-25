const { test, expect } = require('@playwright/test');
const { login, api, savedPost, discussion, mapImage, createMap } = require('./helpers');

test('hidden posts and discussions deny even their token owner; restoration and detach preserve data', async ({ page, browser }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  const target = await discussion(page, 'Scoped map privacy');
  const discussionId = new URL(target.url).pathname.match(/\/d\/(\d+)/)[1];
  const reply = await api(page, 'POST', 'posts', { content: 'Privacy reply' }, 201, 'posts', { discussion: { data: { type: 'discussions', id: discussionId } } });
  const postId = reply.data.id;
  const title = 'Private map payload ' + Date.now();
  const mapId = await createMap(page, title);
  const username = 'privacy' + Date.now();
  const password = 'Disposable-privacy-only-9821';
  await api(page, 'POST', 'users', { username, password, email: username + '@example.test', isEmailConfirmed: true }, 201, 'users');
  const token = await api(page, 'POST', 'chak-maps/' + mapId + '/tokens', {
    name: 'Private owner token', imageUrl: '/smoke-map.svg', ownerUsername: username,
  }, 201, 'chak-tokens');
  await api(page, 'POST', 'chak-map-embeds', { postId: Number(postId), mapId: Number(mapId) }, 201, 'chak-map-embeds');
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const owner = await context.newPage();
    owner.on('pageerror', error => errors.push(error.message));
    await mapImage(owner);
    await login(owner, username, password);
    const move = status => api(owner, 'POST', 'chak-map-embeds/' + postId + '/tokens/' + token.data.id + '/move', {
      x: status === 200 ? 0.25 : 0.9, y: status === 200 ? 0.75 : 0.1,
      postId: Number(target.id), mapId: Number(mapId), ownerUserId: 1,
    }, status, 'chak-tokens');
    await move(200);
    await owner.goto(target.url);
    await savedPost(owner, postId).scrollIntoViewIfNeeded();
    await expect(savedPost(owner, postId).locator('.ChakMapEmbed')).toContainText(title);

    await api(page, 'PATCH', 'posts/' + postId, { isHidden: true }, 200, 'posts');
    const hiddenPost = await api(owner, 'GET', 'chak-map-embeds/' + postId, undefined, 404);
    expect(JSON.stringify(hiddenPost)).not.toContain(title);
    expect(hiddenPost.data).toBeUndefined();
    expect(hiddenPost.included).toBeUndefined();
    await move(404); // Ownership and forged body scope cannot bypass hidden post.
    const unchanged = await api(page, 'GET', 'chak-maps/' + mapId);
    expect(unchanged.included.find(item => item.id === token.data.id).attributes).toMatchObject({ x: 0.25, y: 0.75 });
    await owner.reload();
    await expect(savedPost(owner, postId).locator('.ChakMapEmbed')).toHaveCount(0);

    await api(page, 'PATCH', 'posts/' + postId, { isHidden: false }, 200, 'posts');
    await api(owner, 'GET', 'chak-map-embeds/' + postId);
    await api(page, 'PATCH', 'discussions/' + discussionId, { isHidden: true }, 200, 'discussions');
    await api(owner, 'GET', 'discussions/' + discussionId, undefined, 404);
    const hiddenDiscussion = await api(owner, 'GET', 'chak-map-embeds/' + postId, undefined, 404);
    expect(hiddenDiscussion.data).toBeUndefined();
    expect(hiddenDiscussion.included).toBeUndefined();
    await move(404);
    await api(page, 'PATCH', 'discussions/' + discussionId, { isHidden: false }, 200, 'discussions');
    await api(owner, 'GET', 'chak-map-embeds/' + postId);
    await api(page, 'DELETE', 'chak-map-embeds/' + postId);
    await api(owner, 'GET', 'chak-map-embeds/' + postId, undefined, 404);
    await move(404);
    const retained = await api(page, 'GET', 'chak-maps/' + mapId);
    expect(retained.included.find(item => item.id === token.data.id).attributes).toMatchObject({ x: 0.25, y: 0.75 });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('multiple post maps keep independent data, zoom and token scopes on narrow and desktop layouts', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mapImage(page);
  await login(page);
  const target = await discussion(page, 'Independent embedded maps');
  const discussionId = new URL(target.url).pathname.match(/\/d\/(\d+)/)[1];
  const reply = await api(page, 'POST', 'posts', { content: 'Second independent map' }, 201, 'posts', { discussion: { data: { type: 'discussions', id: discussionId } } });
  const firstId = await createMap(page, 'First isolated board ' + Date.now());
  const secondId = await createMap(page, 'Second isolated board ' + Date.now());
  const firstToken = await api(page, 'POST', 'chak-maps/' + firstId + '/tokens', {
    name: 'First board token', imageUrl: '/smoke-map.svg', ownerUsername: 'smokeadmin',
  }, 201, 'chak-tokens');
  const secondToken = await api(page, 'POST', 'chak-maps/' + secondId + '/tokens', {
    name: 'Second board token', imageUrl: '/smoke-map.svg', ownerUsername: 'smokeadmin',
  }, 201, 'chak-tokens');
  await api(page, 'POST', 'chak-map-embeds', { postId: Number(target.id), mapId: Number(firstId) }, 201, 'chak-map-embeds');
  await api(page, 'POST', 'chak-map-embeds', { postId: Number(reply.data.id), mapId: Number(secondId) }, 201, 'chak-map-embeds');
  await page.reload();
  const first = savedPost(page, target.id).locator('.ChakMapEmbed');
  const second = savedPost(page, reply.data.id).locator('.ChakMapEmbed');
  await first.scrollIntoViewIfNeeded();
  await expect(first).toContainText('First isolated board');
  await second.scrollIntoViewIfNeeded();
  await expect(second).toContainText('Second isolated board');
  await expect(first.getByAltText('Second board token', { exact: true })).toHaveCount(0);
  await expect(second.getByAltText('First board token', { exact: true })).toHaveCount(0);
  const slider = first.getByRole('slider', { name: 'Масштаб игровой карты' });
  await slider.fill('200');
  await slider.dispatchEvent('input');
  await expect(first.locator('.ChakMap-zoomValue')).toHaveText('200%');
  await expect(second.locator('.ChakMap-zoomValue')).toHaveText('100%');
  await api(page, 'POST', 'chak-map-embeds/' + target.id + '/tokens/' + secondToken.data.id + '/move', {
    x: 0.1, y: 0.1, mapId: Number(firstId), postId: Number(reply.data.id),
  }, 404, 'chak-tokens');
  await api(page, 'POST', 'chak-map-embeds/' + target.id + '/tokens/' + firstToken.data.id + '/move', { x: 0.2, y: 0.3 }, 200, 'chak-tokens');
  const secondData = await api(page, 'GET', 'chak-map-embeds/' + reply.data.id);
  expect(secondData.included.find(item => item.id === secondToken.data.id).attributes).toMatchObject({ x: 0.5, y: 0.5 });

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const board of [first, second]) {
      await board.scrollIntoViewIfNeeded();
      const dimensions = await board.evaluate(el => {
        const box = el.getBoundingClientRect();
        const viewport = el.querySelector('.ChakMap-viewport').getBoundingClientRect();
        return { boardWidth: box.width, mapWidth: viewport.width, windowWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth };
      });
      expect(dimensions.mapWidth).toBeLessThanOrEqual(dimensions.boardWidth + 1);
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.windowWidth + 1);
    }
  }
  await api(page, 'DELETE', 'chak-map-embeds/' + target.id);
  await page.reload();
  await expect(first).toHaveCount(0);
  await second.scrollIntoViewIfNeeded();
  await expect(second).toContainText('Second isolated board');
  const retained = await api(page, 'GET', 'chak-maps/' + firstId);
  expect(retained.included.find(item => item.id === firstToken.data.id).attributes).toMatchObject({ x: 0.2, y: 0.3 });
  expect(errors).toEqual([]);
});
