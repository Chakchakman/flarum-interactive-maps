# v0.2.0-alpha.5a — fixed viewport with slider zoom

**Experimental UI branch** based on alpha.4 player movement. No database migrations or backend route changes. The earlier alpha.4 source and demo remain intact.

## Scope

- Embedded maps are clipped to a fixed-height viewing window; post width remains limited to the discussion column. Default dimensions: ~460px desktop / ~300px narrow-screen. Staff editor gets a taller ~560px desktop / ~420px narrow-screen window.
- Each MapBoard instance owns a **50–300% zoom slider**, current percent and a **Вписать** (fit/reset) button. 100% fits the entire uncropped map regardless of portrait/landscape aspect ratio. Smaller maps are centered rather than stretched; larger-than-window maps are clipped.
- A primary **mouse/pen drag on empty map space** pans a zoomed board within fixed bounds. Dragging assigned tokens continues to move the tokens through the existing post-scoped route, not the viewport. The page mouse wheel remains normal page scrolling. Slider itself supports touch; touch-drag panning is deferred for conflict-free forum scrolling.
- mapViewport.mjs is pure geometry to calculate the fitted stage size and constrained offset. Background, SVG grid and tokens render **inside one scaled stage**, so token pointer math still uses that stage's actual bounding rect. Neither zoom nor pan writes to the backend or changes token coordinates, snap cell size or background natural dimensions. Instances are independent.
- ResizeObserver recomputes the stage after responsive layout changes. In an embedded map, it also invalidates Flarum's CommentPost subtree retainer. This preserves the async board from alpha.3.
- No keyed vnode is appended to CommentPost.content; the alpha.3 Mithril crash fix remains intact.

## Local manual acceptance — test in this order

1. On verified alpha.4, confirm the map #9 in post #2 and Yusha's saved owned-token position persist. Save local generated dist assets before switching branches; switch to feature/v0.2-bounded-map-viewport, build JS and clear Flarum cache. No migration.
2. **Forum safety gate first:** initial discussion post displays, BBCode toolbar works, can write and submit a disposable comment, new discussion composer works. If broken, immediately rollback to alpha.4.
3. As Yusha, open post #2 map: embedded board should be inside a fixed-height viewport with a visible slider (default 100%), no vertical expansion when slider moves. Try 50%, 150%, 300%, and the **Вписать** action. Whole map should fit at 100%.
4. At 300%, drag empty background with mouse to pan. Map must stay inside its clipped window. Mouse wheel should continue normal thread scrolling.
5. With zoom 200–300%, drag an owned token onto a visible cell and release. Confirm post-scoped POST returns 200, refresh page and confirm saved position. Confirm grid and token sprite remain aligned. Other tokens must remain unmovable, and clicking them must never send write requests.
6. As manager, open /maps/9, test all zoom and pan controls, drag a token at zoom=100% and again zoom=250%, save and reload. Snap-to-grid placement must match the visible cell. Editor's ownership and grid sliders must still work.
7. Verify portrait, square and landscape images if available; mobile view does not overflow thread width and has a ~300px window. On touch, slider works and vertical page scrolling is not trapped; touch background panning is not part of this iteration.
8. If two different posts have maps, zoom one and verify the other's slider and pan remain unchanged. Ensure no extra API write calls when simply zooming and panning.

## Automated checks and release discipline

- The mapViewport.test.mjs suite covers landscape/portrait aspect ratios, fit/reset, zoom limits, pan clamping, small-map centering and stable saved coordinates.
- Keep PHP syntax, permission tests, JS grid/token/API/inline tests and webpack build passing on push and PR. CI **cannot** certify Flarum DOM runtime; manual smoke gate is required.
- After successful two-account runtime test, commit compiled js/dist/forum.js and its map and confirm final SHA CI success; do not merge/tag as part of this QA.

## Rollback

Switch back to feature/v0.2-post-scoped-token-move, rebuild JS, clear Flarum cache and hard-reload. No database changes or migrations are involved.
