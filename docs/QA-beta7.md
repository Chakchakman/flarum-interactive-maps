# Beta.7 — JSON:API and Flarum 2 integration QA

Branch: `fix/beta7-jsonapi-compat` based on beta.6 commit `a89ccdd`.
**This is a protocol migration, not merely a JS refactor. Do not put this branch onto production without manual tests and a database backup.** No schema migrations are included.

## API contract changes

- Responses now use `Flarum\Api\JsonApiResponse` and `application/vnd.api+json`.
- Maps are typed resources `{type:"chak-maps", id:"…", attributes:{…}}`.
- A map detail's tokens are represented by `data.relationships.tokens.data` identifiers plus full `included` resources of type `chak-tokens`.
- List and detail responses expose `meta.canManage` instead of the old top-level `canManage`.
- Validation/auth/not-found failures use the JSON:API `errors: [{status, title, detail}]` array.
- Successful DELETE returns a JSON:API `meta.deletedId` document.
- Browser requests send `{data:{type,attributes}}`, and the backend continues accepting legacy flat request bodies. The JS adapter can read both old and new responses.
- **External clients using the old flat response format must migrate**; only bundled forum JS is adapted here.

## Functional smoke tests (two Flarum accounts)

1. **Setup:** save MariaDB backup, use throwaway test maps/tokens, do not delete campaign maps. Install beta.7 branch, run `npm run test:api`, `test:grid`, `test:token-sync` and rebuild assets, clear Flarum cache.
2. **List as admin:** `GET /api/chak-maps` status 200, content-type `application/vnd.api+json`, `data` array of typed `chak-maps` resources, `meta.canManage=true`; list and thumbnails render.
3. **Create test map:** `POST /api/chak-maps` status 201; returned `data.type=chak-maps`, `data.id` is a string; browser navigates to new map.
4. **Open map:** `GET /api/chak-maps/{id}` 200, `data.relationships.tokens.data` array (possibly empty) plus `included` array; aspect ratio and grid display correctly.
5. **Add assigned test token:** `POST /api/chak-maps/{id}/tokens` 201, token type `chak-tokens`; after refresh, owner and sprite remain visible.
6. **Player own move:** player account moves only its assigned token; `POST /api/chak-tokens/{id}/move` 200 with `data.attributes.x,y`; after Ctrl+F5 latest location persists; rapid movement must not revert.
7. **Foreign token direct forbidden:** as player, send `POST /api/chak-tokens/{otherUsersTokenId}/move` with **invalid** `{data:{type:"chak-tokens",attributes:{x:-1,y:0}}}`; expect **403 before coordinate validation**, no changes to tokens. This is the outstanding upstream beta.3 security gate; use a **disposable foreign test token**.
8. **Admin grid editing:** PATCH `/api/chak-maps/{id}` updates grid, final slider positions survive reload. Response includes typed map with tokens; other clients' positions cannot be overwritten by a stale result.
9. **Token ownership:** admin reassigns token through the UI; after refresh, new owner can move it, old owner cannot.
10. **Unauthorized destructive action:** regular player sends DELETE for a nonexistent ID and gets 403; admin presses delete on disposable map, cancels once, then confirms 200 and JSON:API `meta.deletedId`; GET for deleted map now 404.
11. **Bad input:** request invalid map/grid data in a safe test map and inspect HTTP 400 with `errors[0].detail`, readable UI error, no data mutation.
12. **Guest:** cannot enumerate private catalog/map in current beta; direct server endpoints deny access as before (current visibility model changes in v0.2).
13. **Performance:** visible tab continues polling, hidden tab does not; no false 'map not found'; no new PHP errors. Compare durations with beta.6, but environment remains 5–10 seconds on standard Flarum requests.

## Release gates

- CI success on the final commit.
- On Windows/Docker lab: manual 2-account tests above and no new 500s in `storage/logs/*.log`.
- After tests, commit and push rebuilt `js/dist/forum.js` and `js/dist/forum.js.map`.
- Confirm **direct cross-owner token move returns 403**; deleting unauthorized map 403 is already checked in beta.5.
- Review error JSON shape and HTTP `Content-Type` in Network after local boot.
- Do not merge/tag beta.7 or previous stacked PRs before upstream gates. No automatic database modifications.

## Architectural note

This milestone changes the existing custom endpoints to emit standards-compatible typed documents; it does not register a full `Flarum\Api\Resource\AbstractDatabaseResource` with the 2.x resource extender, scopes, and Flarum Store models. Formal resource registration, relationship visibility policies, and configurable GM access remain necessary before v0.2 forum post embedding and authorization. Do not represent this as a complete Flarum API-layer integration.
