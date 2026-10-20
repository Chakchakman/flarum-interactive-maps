# Beta.6 — Performance baseline and regression checklist

Branch: `fix/beta6-performance` based on tested beta.5 commit `79503b1`. This milestone starts with **small, measurable client-side reductions**, not speculative database rewrites.

## Changes under test

1. While the browser tab is hidden, suppress the 5-second `GET /api/chak-maps/{id}` polling. When the user returns to the tab, refresh immediately. The initial map load and explicit refresh still work.
2. A successful background GET whose map/tokens/permissions did not change skips the page's own forced Mithril redraw. **Note:** Flarum's request wrapper may still schedule its own redraw, so this does not establish a quantified CPU benefit without profiling.
3. On the map list page, thumbnails are `<img loading="lazy" decoding="async">`, allowing browsers to postpone image downloads until near the viewport instead of eagerly loading every CSS background.
4. No changes to DB/schema, HTTP endpoints, permission rules, 5-second active-tab sync, grid snapping or token movement.

## Capture baseline before switching branches

Use F12 → Network, select Fetch/XHR and enable *Preserve log*:
- Open a map on beta.5 and record load time of `GET /api/chak-maps/{id}`, server duration (Timing) and transferred response size.
- With map visible and idle for 60 seconds, count GET calls.
- Move to another browser tab for 60 seconds and count GET calls, noting timer throttling may occur automatically.
- Open /maps with at least 10 map thumbnails (test images, no secret URLs) and count Images requests while at the top of the page versus scrolling.
- If the browser pauses background scripts itself, compare counts as observed; do not invent a speedup percentage.

## After switching to beta.6

| # | Test | Expected |
| --- | --- | --- |
| 1 | Open map, keep tab visible for 30 seconds | One initial GET plus periodic GETs around every five seconds; no overlapping GETs |
| 2 | Switch to another tab for 30–60 seconds | No new polling requests once tab is hidden; one previously started GET may complete |
| 3 | Return to map tab | One immediate refresh GET, remote token position changes become visible |
| 4 | Map unchanged on successive polls | No flicker, no lost interaction, no map disappearing |
| 5 | Two logged-in users move their own tokens in separate visible tabs | Other client's movement arrives on ordinary next poll, without snapback |
| 6 | Hold a token while polling would occur | Token does not snap away; local pending saves are preserved |
| 7 | Change grid sliders rapidly then reload | Settings persist, and a stale GET does not overwrite local changes |
| 8 | Open /maps with many items, inspect Images requests | Offscreen thumbnail requests may be deferred by browser; thumbnails display when scrolled into view |
| 9 | Create and delete only a **disposable** test map (after backup) | beta.5 administrative management still behaves as before; unauthorized DELETE remains 403 |
| 10 | Test square/landscape/portrait background | beta.4 grid and aspect ratio unaffected |
| 11 | Slow down GET with Network throttling | No overlapping GET requests and no false 'map not found' |
| 12 | Resize window and navigate away from map | Polling interval and visibility listeners stop with the page; no stale updates |

## Recording results

For each browser/device, note:
- beta.5 visible GET count / hidden GET count (60 seconds each)
- beta.6 visible GET count / hidden GET count (60 seconds each)
- typical GET Duration / server Timing for both
- number of map cards and thumbnails loaded initially
- approximate responsiveness; do not attribute slow PHP/SQL response to frontend without evidence

The **expected measurable outcome** is fewer API polls in hidden tabs, and lazy loading of offscreen thumbnails when supported by the browser. This milestone does **not** promise faster PHP queries or instant multi-user sync. More advanced conditional GET / push transport belongs to a later stage.

## Release gate

GitHub Actions PHP syntax, JS build, beta.3 token-sync tests and beta.4 grid tests pass on source; rebuild and commit `js/dist/forum.js` and `js/dist/forum.js.map` only after local Flarum acceptance. Do not merge/tag ahead of unresolved beta.3 direct unauthorized token-move API 403 verification.
