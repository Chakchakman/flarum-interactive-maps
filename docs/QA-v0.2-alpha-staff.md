# v0.2.0-alpha.1 — Staff-only map catalog (manual QA)

**Experimental, NOT for live play.** Branch `feature/v0.2-staff-map-catalog`, stacked on beta.7 commit `ffc4e56`. No database migrations and no deletion of stored map/token records.

## What this alpha adds

- New permission `chakchakman-interactive-maps.map.manage` registered in Flarum 2 admin permission grid (Moderate category).
- Administrators always manage all maps. Other user groups manage maps **only if explicitly granted** that permission. There is no implicit moderator privilege.
- `GET /api/chak-maps` and `GET /api/chak-maps/{id}` return **403 before querying maps** for unauthorized users.
- Map create, update, delete, token create and owner assignment all use the same permission check.
- The server announces `canManageChakMaps` on the Flarum `ForumResource`. The Maps navigation link appears only if that flag is true.
- Direct navigation to /maps and /maps/:id shows a denial screen for non-managers; backend API is always authoritative.
- **Temporarily BREAKING in alpha:** `POST /api/chak-tokens/{id}/move` is restricted to map managers. Ordinary users can no longer move even their own tokens via this legacy route until a post-scoped player endpoint checks which discussion they are allowed to see. This is an intentional security barrier, not an accidental regression.

## Before local QA

1. Ensure beta.7 branch remains committed and preserved. Back up MariaDB; do not run `docker compose down -v`, `flarum migrate:reset`, or Purge.
2. Fetch/checkout experimental alpha branch with clean working tree; run `docker compose run --rm node npm run build` (should produce both `js/dist/admin.js` and `js/dist/forum.js`), then `docker compose exec app php flarum cache:clear`. Existing database migrations are not changed.
3. Open Flarum admin and extension settings: find the newly registered permission "Управлять игровыми картами". Ensure it is NOT assigned to Members or Guests.
4. Keep two accounts ready: (A) administrator; (B) ordinary registered member. Optionally a third user C in a group explicitly granted `map.manage`.

## Two-account acceptance matrix

| Test | Administrator | Ordinary member (no manage) | Explicitly authorized GM |
| --- | --- | --- | --- |
| Header shows Maps link | Yes | **No** | Yes |
| GET /api/chak-maps | 200; data list | **403** (no data) | 200 |
| GET /api/chak-maps/{knownId} | 200; map and tokens | **403** (no data) | 200 |
| GET /api/chak-maps/{nonexistingId} | 404 | **403** (does not reveal ID existence) | 404 |
| Open /maps and /maps/{id} directly | Lists/edits | Denial screen, no map GET | Lists/edits |
| Create or PATCH map | Allowed | **403** | Allowed |
| Create/reassign a token | Allowed | **403** | Allowed |
| Delete map (test map only) | Allowed | **403** | Allowed |
| Legacy POST /api/chak-tokens/{id}/move | Allowed | **403** even if own token | Allowed |
| Legacy POST /api/chak-tokens/{nonexistingId}/move | 404 | **403** | 404 |

**Do not delete real campaign maps.** For unauthorized delete, use a fake nonexisting ID. For manager deletion, use disposable test data only after backup.

## Permission UI test

- In the Flarum admin permissions page, create or select a GM group and grant only the **Manage Maps** permission.
- Log in as that GM. Header link should appear; map catalog GET and create/assign should work. Revoke permission and reload: link disappears and map catalog API responds 403.
- Group ID 4 is not special: being a moderator without explicit permission should have the same denial behavior as an ordinary member.

## Release gate / known limitations

- GitHub Actions: PHP syntax; standalone role matrix `php tests/mapPermissionsTest.php`; beta.3 token queue, beta.4 grid, beta.7 JSON:API tests and production JS build pass.
- Local Flarum 2 manual admin/player/GM test must show no new 500 errors, correct `ForumResource` capability, and admin JS permission registration.
- Commit compiled `js/dist/admin.js`, `js/dist/admin.js.map`, `js/dist/forum.js`, `js/dist/forum.js.map` only after local acceptance. No automated check proves runtime permission integration without a full Flarum install.
- This alpha is **NOT a playable v0.2 release**. Until posts can securely embed maps, ordinary players cannot view or move maps. Keep beta.7 as the normal lab baseline if testing gameplay.
- Future v0.2 embed API must bind map to an authorized post, check discussion visibility and ownership before supplying map/token data or accepting a movement. Never simply reopen the legacy map-by-ID endpoint to all members.
- No `chak_map_embeds` migration, post formatter, or interactive in-post player UI in this PR. These are next milestones with their own QA and backup plan.
