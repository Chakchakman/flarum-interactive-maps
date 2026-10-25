const { test, expect } = require('@playwright/test');
const { login, api, savedPost, discussion, mapImage, createMap, openPicker } = require('./helpers');

const MANAGE = 'chakchakman-interactive-maps.map.manage';
const EMBED = 'chakchakman-interactive-maps.map.embed';

// Use core's real permission endpoint. Preserve the isolated forum's original
// grants, including grants left by earlier tests; never run on a live forum.
async function setPermission(admin, permission, groupIds) {
  const response = await admin.request.post('/api/permission', {
    headers: { 'X-CSRF-Token': await admin.evaluate(() => app.session.csrfToken) },
    data: { permission, groupIds },
  });
  expect(response.status(), await response.text()).toBe(204);
}

async function member(admin, prefix) {
  const username = prefix + Date.now();
  const password = 'Disposable-gm-only-9821';
  const result = await api(admin, 'POST', 'users', {
    username, password, email: username + '@example.test', isEmailConfirmed: true,
  }, 201, 'users');
  return { id: result.data.id, username, password };
}

test('explicit GM grants require manage, embed and post edit; revocation takes effect server-side', async ({ page, browser }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  const target = await discussion(page, 'GM editable scope');
  const mapId = await createMap(page, 'GM permission map ' + Date.now());
  const group = await api(page, 'POST', 'groups', {
    nameSingular: 'GM fixture ' + Date.now(), namePlural: 'GM fixtures', color: '#445566', icon: 'fas fa-dice',
  }, 201, 'groups');
  expect(Number(group.data.id)).toBeGreaterThan(4); // Not a privileged built-in group.
  const user = await member(page, 'gm');
  const csrf = await page.evaluate(() => app.session.csrfToken);
  const assigned = await page.request.patch('/api/users/' + user.id, {
    headers: { 'X-CSRF-Token': csrf },
    data: { data: { type: 'users', id: user.id, relationships: { groups: { data: [{ type: 'groups', id: group.data.id }] } } } },
  });
  expect(assigned.status(), await assigned.text()).toBe(200);
  expect((await assigned.json()).data.relationships.groups.data.some(item => item.id === '1')).toBe(false);
  await page.goto('/admin');
  const original = await page.evaluate(() => app.data.permissions);
  expect(original).toBeTruthy();
  const permissions = [MANAGE, EMBED, 'discussion.editPosts'];
  const grant = (permission, enabled) => setPermission(page, permission,
    enabled ? [...(original[permission] || []), group.data.id] : (original[permission] || []));
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const gm = await context.newPage();
    gm.on('pageerror', error => errors.push(error.message));
    await mapImage(gm);
    await login(gm, user.username, user.password);
    await api(gm, 'GET', 'chak-maps', undefined, 403);
    const attach = status => api(gm, 'POST', 'chak-map-embeds', {
      postId: Number(target.id), mapId: Number(mapId),
    }, status, 'chak-map-embeds');
    await attach(403);

    // Embed alone cannot bypass the private catalog.
    await grant(EMBED, true);
    await api(gm, 'GET', 'chak-maps/' + mapId, undefined, 403);
    await attach(403);
    await grant(EMBED, false);
    await grant(MANAGE, true);
    await api(gm, 'GET', 'chak-maps/' + mapId);
    await attach(403); // Manage alone cannot attach.

    await grant(EMBED, true);
    await attach(403); // Both map grants still cannot edit another author's post.
    const forbiddenPost = await api(gm, 'GET', 'posts/' + target.id);
    expect(forbiddenPost.data.attributes.canEdit).toBe(false);

    // Own composer works without granting broad post moderation.
    const own = await api(gm, 'POST', 'discussions', {
      title: 'GM own composer ' + Date.now(), content: '[b]GM body[/b]', chakMapId: Number(mapId),
    }, 201, 'discussions');
    const publishedAt = Date.now();
    await gm.goto('/d/' + own.data.id);
    await expect(gm.locator('.ChakMapEmbed')).toContainText('GM permission map');

    await grant('discussion.editPosts', true);
    await gm.goto(target.url);
    const modal = await openPicker(savedPost(gm, target.id), gm);
    // Use the real API for the bind, then check persisted rendering in the UI.
    await modal.getByRole('button', { name: 'Отмена', exact: true }).click();
    await attach(201);
    await gm.reload();
    await expect(savedPost(gm, target.id).locator('.ChakMapEmbed')).toContainText('GM permission map');

    // Revoke while the browser still has its old bootstrap permission flags.
    await grant(EMBED, false);
    await api(gm, 'DELETE', 'chak-map-embeds/' + target.id, undefined, 403);
    // Respect core's 10-second post flood window; require the map permission
    // denial itself, rather than accepting a throttle response as a pass.
    await gm.waitForTimeout(Math.max(0, 11000 - (Date.now() - publishedAt)));
    await api(gm, 'POST', 'discussions', {
      title: 'Revoked GM draft ' + Date.now(), content: 'Must not publish', chakMapId: Number(mapId),
    }, 403, 'discussions');
    await grant(MANAGE, false);
    await api(gm, 'GET', 'chak-maps/' + mapId, undefined, 403);
    await api(gm, 'PATCH', 'chak-maps/' + mapId, { gridColor: '#aabbcc' }, 403);
    await gm.reload();
    await expect(gm.getByRole('link', { name: '🗺 Карты', exact: true })).toHaveCount(0);
    // Revocation removes staff privileges, not normal access to a visible post.
    await api(gm, 'GET', 'chak-map-embeds/' + target.id);
    await api(page, 'GET', 'chak-maps/' + mapId);
    expect(errors).toEqual([]);
  } finally {
    for (const permission of permissions) await setPermission(page, permission, original[permission] || []);
    await context.close();
  }
});

