# Product vision: staff map library, maps in posts

Status: agreed user requirements, 2026-10-20. This is a design specification, not a statement that current beta implements it.

## User journeys

### Administrator / moderator / authorized game master
1. A user granted **Manage Maps** permission can see the "Карты" navigation and open the /maps control panel.
2. This panel lists, creates, edits and (after safe deletion ships) deletes maps. Ordinary members and guests do not see it and cannot access its APIs or the route.
3. Authorized staff can attach a map to a discussion post via a composer action (e.g. "Вставить карту") that inserts a safe marker such as `[interactive-map id=42]`.
4. Staff can assign token ownership to a forum member in the map editor.
5. The chosen post renders an interactive map in the post body. The staff preview/editor can reuse the same reusable component as the player view.

### Player
1. Player opens a discussion they are permitted to view and sees the embedded map in the post, not a separate map index.
2. Player sees the grid and tokens for that embedded map, but cannot access the staff /maps catalog and cannot insert/edit/delete maps.
3. Player can move their own token directly inside that post. The change is optimistic and saved on the server, surviving page reload. Other players' tokens remain read-only.
4. The map must still work when the forum thread is scrolled, when multiple posts embed different maps, and after edit/reload.

## Rights model

A moderator group is *not* a privileged special group in Flarum 2. The administrator group automatically has full permissions, while a "moderator" group requires explicit configured permissions. Do not hardcode group ID 4 or grant all moderators blanket access by label.

Create named permissions via Flarum's admin permissions grid:
- `chakchakman-interactive-maps.map.manage`: staff catalog, create, edit, delete maps, assign token owners.
- `chakchakman-interactive-maps.map.embed`: attach existing maps to a post that the actor may edit.
- `chakchakman-interactive-maps.token.move-own`: logged-in player movement (subject to token ownership, map visibility and discussion/post scope). May be a built-in action rather than a broad group permission.

**Do not assume hiding a navigation link is authorization.** Apply server-side permission checks to the catalog, all admin API routes, map embeds and token moves.

For embedded maps, check:
- The requesting actor may view the **specific discussion/post** carrying the map.
- The map is actually associated with that post via a validated reference, not merely a guessed map ID.
- Admin/authorized map managers or the token's current assigned owner may move a token as appropriate; a regular player may move **only their assigned token** on an authorized, visible post embedding that map.
- The actor must be authenticated to mutate any token; sending an arbitrary `ownerUserId`, `mapId` or `postId` in a request must not bypass server authorization.
- Do not leak private maps/tokens through `GET /api/chak-maps/{id}`, the catalog endpoint, public forum bootstrap, or direct image-proxying routes.

## Technical architecture (proposed for v0.2.0)

1. **Separate data and UI:** independent reusable `MapBoard` component for grid, imagery, tokens, and pointer interactions. Staff editor and embedded post both reuse it; not a mounted copy of the entire `MapPage`.
2. **Safe post marker:** register a custom formatter tag via Flarum `Extend\Formatter` (exact parsing syntax/behaviour to be confirmed in integration tests). The rendered content should contain only a safe placeholder with a numeric map ID; hydrate it to a Mithril component. Do not use arbitrary user-supplied iframe/HTML and do not initialize a global single canvas.
3. **Authorization-bound embed:** use a map-to-post association record (e.g. `chak_map_embeds` with `map_id`, `post_id`, audit fields), created only through a permission-checked action. The API receives the post context and validates post existence, discussion visibility and association. A plain map ID must not bypass those checks.
4. **API split:** admin CRUD endpoints under `/api/chak-maps` protected with `map.manage`; player-specific GET and token-move endpoint scoped to `/api/chak-map-embeds/{postId}/...`, validating discussion visibility and the corresponding map/token.
5. **Performance:** load data only when an embedded map scrolls into view; suspend polling for off-screen posts; use differential token updates and avoid one separate full-map request per post every 5 seconds.
6. **Backward compatibility:** migrate existing map records without deleting them, do not break existing posts, and keep a temporary staff-only `/maps/{id}` editing view. Do not expose the old player detail route.
7. **Graceful fallback:** when a map is deleted or permissions are revoked, the post shows a safe human-readable placeholder (not broken DOM or a blank thread).

## Version boundaries and acceptance

- **beta.2 → stable v0.1:** remain focused on restore/create/open, movement, grid and API/performance regression fixes as scheduled. Do not import experimental PR #1 wholesale.
- **v0.2.0 alpha:** register permissions, hide and forbid staff catalog for members/guests (403 or 404), staff creation/management still functional.
- **v0.2.0 beta:** embed one map per post, with server-validated post visibility, assign token, owner movement from inline post. Test multiple embeds, post edit, and unauthenticated/private threads.
- **v0.2.0 final:** layout and performance checks, moderation group configured in admin UI, no data loss and no privilege escalation.

Cross-account test matrix:
| Actor | /maps catalog | Attach map to post | View map embedded in visible post | Move assigned own token | Move someone else's token |
| --- | --- | --- | --- | --- | --- |
| Guest | No | No | No for authenticated-only maps | No | No |
| Ordinary member | No | No | Yes when allowed to view discussion | Yes | No |
| Moderator granted manage/embed | Yes | Yes where post edit is permitted | Yes | As explicitly authorized | As explicitly authorized |
| Administrator | Yes | Yes | Yes | Yes | Yes |

If forum thread is private, ordinary members with no access to that discussion must see **no** map data even if they guess its ID.
