# Beta.4 — Grid geometry and controls: QA checklist

Branch: `fix/beta4-grid-geometry` (based on beta.3). No schema migrations. Do not combine with experimental PR #1.

## Changes under test
- The map canvas uses the background image's **natural width / height** (not fixed 1280x853).
- The visible lines are an SVG grid in exactly the same coordinate system as token snap.
- Sliders apply locally immediately (`oninput`), PATCH requests are coalesced after 400ms and never overlap.
- A map read started before an edit does not overwrite the edit; token movement remains protected by beta.3 logic.
- On missing/invalid image, old dimensions are used for **display only**; snap is disabled to avoid saving a wrong cell.

## Before testing
1. Switch to `fix/beta4-grid-geometry` with a clean working tree (save local `js/dist` changes first).
2. Run `docker compose run --rm node npm run test:token-sync` and `npm run test:grid` via the node container.
3. Rebuild `docker compose run --rm node npm run build`, clear cache, hard refresh.
4. Prepare three test maps: square background (e.g. 1000×1000), landscape (2048×1024), portrait (720×1280). The actual image resolution matters; their URLs must load in the browser.

## Test cases

| # | Test | Expected |
|---|---|---|
| 1 | Open square, landscape, portrait images | Background keeps its original proportions; grid lines cover the image; no stretch/crop |
| 2 | Change cell size smoothly several times | Grid previews immediately while dragging; background never reflows on every cell change |
| 3 | Change X/Y offsets between -256 and +256 | Lines shift in matching directions; negative values work |
| 4 | With snapping enabled, drop a token into a chosen cell | Token centers on visually drawn cell. Check top-left, center, and right/bottom edges |
| 5 | Resize browser window and test snap again | Same cell in image coordinates, independent of browser width |
| 6 | Drag size slider across at least 20 values quickly, open F12 Network | One consolidated PATCH after stopping, rather than 20 overlapping PATCH requests |
| 7 | Artificially slow PATCH response with network throttling; change size and offsets again | Older PATCH response does not reset newer preview; after requests drain, final values persist after Ctrl+F5 |
| 8 | Toggle visibility and snap flags | Toggles work, persist and do not alter unrelated token coordinates |
| 9 | Use own token from ordinary user account | beta.3 movement still works; another player's token cannot be dragged |
| 10 | Start a map GET, change grid before GET resolves | No stale response resets newer local settings |
| 11 | Open an image URL that fails to load | Clear fallback warning; snapping disabled until image dimensions known, no JS crash |
| 12 | Create/open another map and reload | beta.2 map CRUD basics remain functional; no PHP 500 |

## Important limitations
- Grid size uses **natural image pixels**. On a huge source image (4096x4096), size=64 makes smaller grid cells than on a 1024px image; this is expected.
- Existing map grid numeric settings are retained; they may *visually change* when applied to non-1280×853 backgrounds because the old implementation assumed fixed dimensions. No data is deleted or migrated.
- SVG grid and token positions are normalized relative to the same un-cropped image rectangle. Any future choice of image object-fit / zoom must update both together.
- The Windows/Docker performance baseline remains separate; verify Network response times rather than assuming a 5s load is due to the grid.

## Delivery gate

The CI suite must pass on the final commit, followed by visual confirmation in Flarum. The user should commit the **rebuilt** `js/dist/forum.js` and `js/dist/forum.js.map` after testing, as done for beta.3. No release/tag/merge before those checks.
