# v0.2.0-alpha.3a — lazy, read-only map inside a Flarum comment

**Experimental UI branch; no new migrations.** Branch `feature/v0.2-inline-readonly-map`, based on the locally verified post association API in alpha.2a. Keep earlier PRs draft and preserve the working Flarum backup.

## Implementation scope

- Registers `hasChakMap` read-only Boolean on Flarum 2 `PostResource` for authenticated users viewing comment posts. For performance, one indexed map association lookup is made per discussion in an API request instead of per serialized post.
- Extends native Flarum `CommentPost.content()` with an independent Mithril component whenever `post.attribute('hasChakMap') === true` and post is not hidden.
- This component waits for `IntersectionObserver` viewport entry before requesting `GET /api/chak-map-embeds/{postId}`. It NEVER loads map details using a bare `mapId`. No queries for posts without linked maps.
- Reuses a pure `MapBoard` rendering component for existing staff editor and in-post view; grid patterns are uniquely identified per board.
- Renders title, background, grid, token sprites and a manual Refresh button. Uses original image dimensions for grid geometry.
- **Read-only:** never moves tokens or changes map settings from the post. Post-scoped player token movement is planned for a subsequent PR and will require an independent API permission check.
- If a link is removed or access is denied after the post was loaded, display a generic unavailable notice, never raw API errors or map data.
- No post-text formatting, marker, composer integration, edits to stored text, or migrations in this PR.

## Local smoke test on Flarum 2 (two accounts)

1. Verify the previous branch alpha.2 source is locally committed and the database is backed up. The original test association remains: **map #9** to **comment post #2** in discussion #1.
2. Run `git switch --track origin/feature/v0.2-inline-readonly-map`, `docker compose run --rm node npm run build`, and `docker compose exec app php flarum cache:clear`. **No database migration required.**
3. As administrator, open discussion #1. In Network `GET /api/posts?...` or post-included API resource for post #2 should have `attributes.hasChakMap: true`. For unlinked post #1 it should be `false`. Post #2 should display a read-only inline game board below the comment text; post #1 should show no map placeholder.
4. Scroll to map #2. Check that `GET /api/chak-map-embeds/2` loads **only when map is near viewport**; returns 200. Confirm map #9 background, native-image grid and tokens match staff editor and that grid is not stretched.
5. The Refresh button retrieves the current map state; Ctrl+F5 shows the board again. No `POST /api/chak-tokens/.../move` or PATCH map requests should occur when clicking/dragging an embedded token.
6. Repeat as normal `Yusha` without map-manage permission: inline map remains visible on **allowed** post; `GET /api/chak-maps/9` stays 403; token remains read-only. Anonymous guest does not get map data.
7. Hide post #2 as administrator. Under `Yusha`, verify post-scoped API returns 404, and **no map board is shown in the hidden post**. Restore and reload: map returns.
8. If the link is detached (manager-only), the next fresh post API response should have `hasChakMap:false`; inline board disappears. Keep link for later movement tests: re-attach only if deliberately detached.
9. Test a second *different* post with a different map association: boards must display correct individual maps, no duplicate SVG grid pattern IDs, no globally shared data. Test a very long thread by scrolling to the embedded post; unrelated posts should not initiate full-map requests.
10. Check mobile/narrow layout, Flarum theme light/dark, console errors, and no PHP fatal errors. If the map is missing, inspect `hasChakMap` on post #2 first, then Network `/api/chak-map-embeds/2`.

## Known risks / release gates

- The `PostResource` extension is new and **must be validated against the running Flarum 2 serializer** in a local smoke test; successful CI alone proves neither the field is present nor proper lifecycle of Mithril components.
- Lazy loading is visual-only and uses observer near viewport; this version does not automatically poll while visible. Refresh is manual; real-time token synchronization is later.
- The staff editor has been refactored to use the shared `MapBoard`. Its pointer movement, snapping and refresh should be regression-tested as a **manager**.
- Without a database migration, rollback is `git switch feature/v0.2-post-map-binding` followed by JavaScript rebuild and Flarum cache clearing; no campaign records are modified.
- Compiled `js/dist/forum.js(.map)` must be pushed after the two-account runtime acceptance, and final SHA should pass both push/PR CI.
