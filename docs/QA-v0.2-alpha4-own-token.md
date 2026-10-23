# v0.2.0-alpha.4a — player movement inside a visible post

**EXPERIMENTAL.** Base: alpha.3 inline post-map branch. No new migrations, no permission grants, no text/formatter changes. The old staff-only /api/chak-tokens/{id}/move endpoint is unchanged.

## Implemented

- `POST /api/chak-map-embeds/{postId}/tokens/{tokenId}/move` with a JSON:API body `{"data":{"type":"chak-tokens","attributes":{"x":0.5,"y":0.5}}}`; successful response is a typed `chak-tokens` JSON:API document.
- Authentication required. Flarum post `whereVisibleTo($actor)` and `PostMapAccess::canView` must both pass. A post must have an existing `chak_map_embeds` association. Token must exist **within that specific associated map**. Missing/hidden/unlinked post or wrong-map token => 404 without revealing resources.
- Normal player may move only a token whose `owner_user_id` equals their authenticated Flarum user ID. Unassigned and other users' tokens denied (403). Administrators or authorized `map.manage` masters can reposition any token **on a post they may view**.
- Coordinates numeric, finite and normalized within [0,1]. Invalid values rejected with 400. IDs in request body ignored; route+database association determine map/token.
- Inline `EmbeddedPostMap` now allows pointer drag only for current user's token, plus staff-management override; persists through the new post-scoped route, optimistically updates position, snaps to grid using natural image dimensions, serializes writes via `LatestTokenMoveQueue`, rolls back failed writes and shows an error. Cancelling pointer interaction restores the starting point without a request.
- Mobile/touch pointers: token interaction consumes pointer gestures; background remains scrollable. No map viewport zoom/pan yet (tracked separately).
- Manager's existing map-page editor remains on the separate restricted legacy endpoint. Other tokens in post stay non-draggable.

## Local test prerequisites

1. Keep local DB backup from alpha.2 before testing; no migration required. Run `git status --short` before changing branches and stash only known generated JS assets. Branch is `feature/v0.2-post-scoped-token-move`; production JS needs `docker compose run --rm node npm run build` and Flarum cache clear.
2. Preserve map #9 associated with post #2 in discussion #1. Log in as administrator, open staff map #9 and assign **one disposable token** to confirmed regular account `Yusha`; record token ID. Ensure at least one distinct other-player or unassigned token exists (avoid touching actual campaign data).
3. Basic Flarum smoke gate FIRST: forum landing, discussion #1 first post, reply composer and BBCode toolbar, ability to write/submit a disposable reply without JS errors. If broken, rollback to alpha.3, rebuild, clear cache, stop.
4. As ordinary user `Yusha`, open discussion #1. Post #2 shows the embedded map. **Only owned token** should have grab cursor/highlight and respond to pointer drag; other sprites are read-only. Drag own token to a new cell, release, observe `POST /api/chak-map-embeds/2/tokens/{id}/move` returns 200, reload, confirm persisted coordinates. In Network ensure NO old `POST /api/chak-tokens/{id}/move` by player.
5. Drag rapidly several times and refresh only after writes finish. Final position must persist; cannot move other/unassigned tokens. When clicking buttons and scrolling the thread outside a token, regular Flarum interactions still work.
6. Direct security test as Yusha: `POST /api/chak-maps/9/tokens` -> 403; old staff move endpoint -> 403; **new** post-scoped move using a different/unassigned token ID -> 403; nonexistent/other-map token ID -> 404; unlinked/hidden post ID -> 404; malformed/out-of-range / NaN / huge / negative coords -> 400; guest -> 403.
7. Hide post #2 as admin, retry scoped movement as Yusha -> 404, then restore post and retry valid own move -> 200. Also test a private discussion/post visible to an authorized GM but not Yusha and confirm 404 from Yusha. **Never move or delete production campaign tokens for tests.**
8. Verify manager can move tokens in staff editor and from visible inline board. Check changed coordinates reappear in both after reload, and no changes to owner assignments, other maps, post association or grid offset.
9. Regression on two simultaneous embedded boards when available, mobile/touch, themes, and discussion pagination. No React/iframe or special BBCode is introduced here; the upcoming Export/insertion feature is separate.
10. Once tests pass, commit generated `js/dist/forum.js` and `.map`, run CI again on last SHA. Keep PR draft pending full local cross-user acceptance.

## Rollback

Switch to `feature/v0.2-inline-readonly-map`, rebuild `js/dist`, clear Flarum cache, hard refresh; neither backend migration nor database restoration is needed. The unmodified `chak_map_embeds` link to post #2 will continue to display in read-only mode. Don't use Flarum Purge to roll back code.
