# beta.5 manual QA — safe map management

Branch: `fix/beta5-safe-map-management`, based on the tested beta.4 build. This adds **destructive functionality**; the current forum's maps/tokens are not touched by a code change or by compiling JS. A DELETE request **will permanently delete** the selected map and associated tokens.

## Safety gates

1. Make a MariaDB backup before exercising deletion. Do not drop tables, reset migrations, uninstall the extension, or test using a real campaign map.
2. Create a **new disposable map** named `DELETE ME - beta5 test` using an available background image. Add two temporary tokens to it.
3. Record the disposable map ID; verify it differs from all pre-existing maps. If unsure, stop.
4. Only the disposable map may be deleted during this test. Do not test the confirmation button on an existing campaign map.

## Tests

| Test | How | Expected |
| --- | --- | --- |
| Confirm cancel | Administrator presses Delete next to disposable map, then Cancel | No DELETE request; map and tokens preserved |
| Confirm delete | Administrator presses Delete, then confirms | Exactly one DELETE `/api/chak-maps/<disposable ID>`, HTTP 200 `{success:true,id:<ID>}`; card disappears |
| Reload after delete | Refresh list | Disposable map remains absent; every other map unchanged |
| Delete missing map | Administrator sends DELETE to the same deleted ID | HTTP 404; no unrelated data affected |
| Ordinary member UI | Log into regular non-admin account and open /maps | No delete buttons |
| Ordinary member direct API | As regular member, issue DELETE for a *nonexistent* positive map ID | HTTP 403; no data mutation |
| Guest direct API | Unauthenticated DELETE for a *nonexistent* positive map ID | HTTP 403; no data mutation |
| Normal operations | Admin creates and opens another map; ordinary member moves own token | beta.2/beta.3 behavior unchanged |
| Token cleanup | Verify deleted map's token records are absent (DB inspection only on disposable map ID) | No orphan tokens for deleted test map |

## Error-handling checks

- DELETE is prevented by a native confirm dialog; button disables during the request.
- On HTTP error, the card remains visible and an error is shown.
- The client must not remove a card optimistically before HTTP 200.
- Server validates admin role before accessing the map, and deletion of a map plus its tokens occurs inside a DB transaction.
- No PHP/migration changes other than the new controller and route are permitted in this release.

## Upstream constraints

Beta.3 still needs a direct unauthorized token move API test returning 403 before its release and, therefore, before a stable beta.5 release. Moderator permissions and hiding /maps from ordinary members belong to v0.2.0; **beta.5 only adds admin-only deletion controls**, not the final staff catalog authorization model.

## After verifying

Only after the manual tests succeed, commit `js/dist/forum.js` and `js/dist/forum.js.map` from your local Docker build to the beta.5 branch; CI on the final commit must pass before release.
