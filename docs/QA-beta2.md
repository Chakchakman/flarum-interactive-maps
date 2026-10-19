# beta.2 manual acceptance: map creation and opening

**Base:** `recovery/last-working-audit-build` commit `821d761`.
**Target:** `fix/beta2-core-stability`. Do not import the experimental PR #1.
**Safety:** use a disposable test map and do NOT delete existing maps or reinstall/migrate Flarum to diagnose loading errors.

## Preconditions

- Verify git branch with `git branch --show-current`.
- The forum is enabled and functional; browser session is administrator.
- Use Flarum 2.x on `http://localhost:8080` and an available test background (e.g. `http://localhost:8081/map.jpg`, if prototype container runs).
- Open browser Developer Tools → Network → Preserve log, then navigate to `/maps`.

## Steps / expected results

| # | Action | Expected result |
|---|---|---|
| 1 | Load `/maps` as admin | `GET /api/chak-maps` returns HTTP 200, `data` array, create form visible |
| 2 | Create map `Beta 2 Smoke Test` | `POST /api/chak-maps` returns HTTP 201 with `data.id` a positive integer |
| 3 | Follow redirect to detail page | URL is `/maps/<id>`, `GET /api/chak-maps/<id>` returns HTTP 200, response `data.id` matches ID |
| 4 | Reload page (`Ctrl+F5`) | Map still opens with same title and background; no generic "Карта не найдена" |
| 5 | Navigate back to list; click newly created map | Opens again; same ID |
| 6 | Open incognito and request each API URL | Both `/api/chak-maps` and `/api/chak-maps/<id>` respond HTTP 401 for unauthenticated guest |
| 7 | Open map as regular registered member | GET details allowed, but create form is hidden |
| 8 | Attempt creating as regular user through API (non-destructive, no special privileges) | Server returns HTTP 403; unauthorized map is not created |
| 9 | Refresh and navigate several times | No PHP 500, no browser console errors, no missing map ID; unrelated forum pages remain usable |

A map created for this test can remain until the separate deletion feature in beta.5; do not manually drop database rows as cleanup.

## Guest API smoke tests (PowerShell)

Run each line separately:

```powershell
curl.exe -i http://localhost:8080/api/chak-maps
```

```powershell
curl.exe -i http://localhost:8080/api/chak-maps/1
```

Expected for each: HTTP 401. The second URL's ID can be replaced by an existing map ID.

## If something fails

1. Copy the exact request URL, HTTP status, and JSON response from the Network tab (especially POST create and GET detail).
2. Browser console: copy the error text and stack trace, if any.
3. Check recent Flarum logs from the lab directory:
   ```powershell
   docker compose exec app sh -c "ls -l storage/logs; tail -n 100 storage/logs/*.log"
   ```
4. Check app container errors:
   ```powershell
   docker compose logs --tail=100 app
   ```
5. Record observed wall-clock time and Network TTFB separately. Windows bind mounts can make slow forum responses unrelated to extension code.

**STOP gate:** Do not merge, tag or start beta.3 if any of steps 1–6 fail. No schema migrations or DB resets to fix display problems.
