# beta.3 manual QA — token movement and local synchronisation

Branch: `fix/beta3-token-sync` (stacked on beta.2). No database migrations and no staff/catalog changes.

## Preconditions

- Flarum 2.x running, branch checked out and `js/dist/forum.js` rebuilt with the new source.
- Administrator and separate ordinary member accounts.
- Existing test map with at least two tokens; assign one token to the member.
- Open DevTools → Network, Preserve log, filter `chak-` requests.

## Acceptance tests

| # | Step | Expected |
|---|---|---|
| 1 | Administrator drags token once, reloads | POST `/api/chak-tokens/<id>/move` succeeds; saved location remains |
| 2 | Drag the **same** token at least ten times over less than five seconds, stop and wait | No jump back during dragging or at 5-second poll boundary; position remains in final cell after refresh |
| 3 | In Network, throttle to Slow 3G, drag one token three times while first POST is still pending | Newest position remains under control, no older response overwrites it; only first and latest queued write need be sent |
| 4 | Start a background GET then drag token before response arrives | Stale GET does not undo the drag |
| 5 | Two different tokens moved one after the other while requests are pending | Both persist independently; no inadvertent token overwrite |
| 6 | Ordinary member moves owned token | Allowed; coordinates persist after reload |
| 7 | Ordinary member attempts moving another user's token | UI does not drag; direct forged POST gets HTTP 403 |
| 8 | Drop offline/disable network, then drag | Clear save error shown; location reverts to last acknowledged position when no newer edit exists |
| 9 | Open same map in second browser tab and watch other player's token | Remote updates continue approximately every five seconds when local tab is idle |
| 10 | Create new map, open/reload existing maps | Core beta.2 behaviour still functional; no console/PHP errors |
| 11 | In DevTools set Network throttling to Slow 3G; open a map whose GET takes more than 5 seconds | Initial loader remains visible until first successful GET finishes; only one map GET pending at a time; map opens, not a false “Карта не найдена” |

## Automated tests

From the lab root:
```powershell
docker compose run --rm node npm run test:token-sync
```

```powershell
docker compose run --rm node npm run build
```

GitHub CI also runs PHP lint, the queue tests, and JS production build.

## Known boundaries

- Map GET polling is single-flight, so slow responses are not superseded solely by elapsed time. If a user changes local state after the GET starts, that response is discarded intentionally.
- The queue serializes moves **per token per browser tab only**. Simultaneous writes from different devices require v0.3 multi-client conflict handling.
- In-flight moves are not resilient to a browser tab abruptly closing or prolonged network loss; display failure and retry by moving again.
- Grid sizing/offset and staff deletion are left unchanged for their own release milestones.
- A production-ready `js/dist/forum.js` must be built, committed, and tested before this branch can be merged.
