# Circular token images

Requested 2026-10-25. All board tokens (owned, unowned, staff and player views) and sidebar thumbnails use centered object-fit:cover and a 50% border radius. Portrait/landscape images fill their existing circular box without distorting proportions; source images are not modified. The board's existing source-image sizing, center anchor, grid snapping, zoom/pan and authorization are unchanged. No migration.

Local checks: 40 JS tests/build and 9 browser scenarios passed. The real two-account scenario verifies cover/radius/equal rendered width-height for both owned and other tokens, then drags the owned token at 200% zoom and checks coordinates after reload. Normal topic/reply/BBCode/picker/owner-search regressions remain in the gate. An initial browser run hit the test server before it finished restarting; after HTTP readiness the full run passed. This was an environment startup race, not a product failure.

Owner confirmed the supplied circular-token manual check succeeded on 2026-10-25, using code 28bff5e (editor/post image fit and movement/reload checklist). This does not establish every theme, mobile layout or role combination. Original image files and existing map/post links must be preserved. No release or merge approval.
