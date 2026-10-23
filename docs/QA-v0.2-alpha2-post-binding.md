# v0.2.0-alpha.2a — Secure map ↔ post binding API

**EXPERIMENTAL BACKEND MILESTONE; NOT AN IN-POST MAP UI YET.**
Branch: `feature/v0.2-post-map-binding`, based on validated alpha.1 `feature/v0.2-staff-map-catalog`. GitHub PR remains draft.

## New database table — BACK UP FIRST

Migration `2026_10_23_000003_create_chak_map_embeds.php` creates **only a new table** `chak_map_embeds`: `id`, `post_id` (**unique**: maximum one map per saved post), `map_id`, `created_by`, timestamps. Existing `chak_maps` and `chak_tokens` data are unchanged. Deleting a map cleans linked embeds in the same transaction; deleting a post cleans linked embeds on Flarum's `Post\Event\Deleted`.

**Do not run `php flarum migrate` until a database backup is copied OUTSIDE the database container and verified.** Flarum's migration can create the table permanently; switching Git branches does NOT roll it back. Do not use Purge or `migrate:reset` as a rollback mechanism.

## Permission model

- Only admins or members granted **Manage Maps AND Embed Maps** may attach/detach. `chakchakman-interactive-maps.map.embed` is a new, separately grantable permission shown in Flarum admin.
- Staff must also be authorized to **edit the specific saved comment post** using Flarum's `$actor->can('edit', $post)`, and post must be visible to that actor. Even a GM with global map permissions cannot attach to an arbitrary post that they cannot edit.
- Map detail and catalog remain private staff endpoints.
- Any authenticated member can read a post-scoped map **only if that exact Flarum comment post is visible to them**, the post is linked to the map in the association table, and the map still exists.
- An inaccessible/hidden/nonexistent post, deleted link, missing map, or post with no attached map returns **404** on the post-scoped GET, not a payload revealing map data. Guests get 403.
- Old token move API remains **staff-only** from alpha.1; the post-scoped token movement will be a *later* isolated change with its own ownership and discussion access guards.

## API

- `POST /api/chak-map-embeds`: manager and embed permission + edit-visible-post checks. JSON:API body `{"data":{"type":"chak-map-embeds","attributes":{"postId":123,"mapId":9}}}`. Returns 201 with typed `chak-map-embeds`; repeated same link 200; different map on same post 409.
- `GET /api/chak-map-embeds/{postId}`: authenticated + Flarum post visibility + existing association, returns typed `chak-maps` and its included `chak-tokens`, with `meta.postId`. Does NOT accept bare map IDs.
- `DELETE /api/chak-map-embeds/{postId}`: staff with both permissions and edit rights only; detaches map from the post but DOES NOT delete the map or tokens. Returns `meta.detachedPostId`.

## Two-account Flarum acceptance

1. Back up DB to Windows, then checkout alpha.2a and execute migration. Build JS **including admin.js** and clear Flarum cache. Do not put this branch into active play.
2. Create one disposable **comment post** in a visible test discussion, and note the actual **post ID** (not the discussion ID). Use a manager account with `Manage Maps`, `Embed Maps`, and that post's `canEdit`.
3. Before attachment: GET /api/chak-map-embeds/{postId} -> 404 for player and manager.
4. Attach map #9 to this test post as authorized staff: expect 201, typed resource, correct IDs; attach same map again -> 200. Attaching a different map to same post -> 409, original remains.
5. As logged-in **ordinary registered player** who may see the discussion: GET /api/chak-map-embeds/{postId} -> 200, typed map with `relationships.tokens` + `included`. But GET /api/chak-maps/9 stays 403 and old POST /api/chak-tokens/{id}/move stays 403.
6. With a player **unable to see** a private/hidden post, guessed GET /api/chak-map-embeds/{postId} -> 404 and **no map fields**; guest GET -> 403.
7. Player POST/DELETE map embed -> 403; manager **without** embed permission -> 403; staff who cannot edit post -> 403.
8. Staff detach -> success with meta; following scoped GET -> 404; the map itself remains accessible in staff catalog.
9. Reattach test link, then delete **only disposable post**, check link cleaned; **do not delete campaign maps**. Test map deletion cleanup using disposable map and backed-up database if needed.
10. Verify no PHP 500 errors and no change to original map/token content. Also test group permission revocation.

## Known limitations and rollback

This is a **backend milestone only**. No safe formatter marker, Mithril post component, composer action, mobile layout, or player movement has shipped. No one should be promised an interactive map in the post yet.

Rollback UI/runtime code by switching back to alpha.1 and rebuilding PHP/JS assets, but the added table remains until intentionally migrated down. An unreferenced table does not change or expose existing maps/tokens. Backup provides full DB rollback if needed; never use destructive Flarum Purge to undo.

The authorization checks need **local Flarum integration tests**, not just isolated PHP syntax/unit tests. PHP tests do not prove the Flarum migration or post visibility scopes execute correctly inside a live forum.
