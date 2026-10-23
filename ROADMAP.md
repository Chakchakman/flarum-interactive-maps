# Interactive Maps — Roadmap

Status: working plan, agreed 2026-10-20. Versions are milestones, not release dates.
**Rule:** no release is tagged until its acceptance checks pass on Flarum 2.x. No schema migrations without a database backup.

## Stage 1 — Reliability of the first public release

| Version | Scope | Release gate |
| --- | --- | --- |
| v0.1.0-beta.2 | Restore map creation/opening, stable API errors, protect existing map data | Repeat create → open → reload → list tests; guest endpoints return 401; zero PHP fatal errors |
| v0.1.0-beta.3 | Token movement and ownership | Ten rapid movements retain final location after reload; token ownership enforced server-side |
| v0.1.0-beta.4 | Grid geometry and UI responsiveness | Square/portrait/landscape backgrounds; precise snap; settings persist without jump-back |
| v0.1.0-beta.5 | Safe map management | Admin-only edit/delete with confirmation; delete test map and related tokens; members denied |
| v0.1.0-beta.6 | Performance | Browser/DB/PHP baseline; eliminate unnecessary requests and image-loading bottlenecks; no regression |
| v0.1.0-beta.7 | Flarum 2 API compatibility and quality | Migrate responses to appropriate JSON:API conventions, tests and Floxum re-audit |
| v0.1.0-rc.1 | Release candidate | Feature freeze; installation/upgrade/security regression checklist |
| v0.1.0 | First stable public release | RC accepted on clean Flarum installation; documented rollback path |

### Target product experience (agreed 2026-10-20)

**Staff-only map library, gameplay inside discussion posts.** The /maps catalog is not the players' destination. Admins and authorized moderators/game masters manage maps in a staff-facing control panel. Players see embedded interactive maps inside the discussion posts they are permitted to view, and can move only their own assigned tokens. See [PRODUCT-VISION.md](docs/PRODUCT-VISION.md) for the permissions and implementation design.

### Future features (provisional)

- **v0.2.0:** **priority feature — embed interactive maps in discussion posts**, staff-only map catalog and configurable manage/embed permissions, server-validated per-post/per-discussion visibility, player move-own-token inside the post. This supersedes the earlier v0.7 embedding schedule.
- **v0.3.0:** multi-client token sync; collision/conflict handling and presence.
- **v0.4.0:** pan, zoom in **both embedded post maps and the staff map editor**, measurement tools and map markers.
- **v0.5.0:** image upload, map editor, overlays and layers.
- **v0.6.0:** fog of war, hidden tokens, visibility and conditions.
- **v0.7.0:** more advanced game sessions, scoped GM assignments and other Flarum integrations.
- **v1.0.0:** mature documentation, compatibility tests, release/upgrade guarantee.

### Map zoom and navigation — both contexts (v0.4.0; may be pulled forward after v0.2 player movement)

- **Staff map editor (`/maps/{id}`):** `+`, `−`, `100%`/reset controls; optional wheel zoom and panning; do not confuse map navigation with token dragging or grid editing.
- **Embedded map in a discussion post:** the same zoom controls with a compact toolbar; navigating the board must not hijack normal discussion scrolling; support mouse, trackpad, touch/pinch when feasible.
- **Geometry:** background, SVG grid and token images scale and move together. Zoom is strictly a client-side *viewport transform*: saved token coordinates, snap-to-grid calculations, image natural dimensions, and map association/permissions remain unchanged.
- **Isolation:** zoom/pan state is independent for each displayed board (including multiple posts with maps), so changing one board cannot move or scale another.
- **Acceptance:** zoom in/out/reset on desktop and narrow/mobile layouts, preserve token position relative to grid at every zoom level, no regressions to editor drag-and-drop or forum post/composer rendering, no unauthorized write requests.

## Branch and release discipline

1. Keep `main` for reviewed releases; do not merge the experimental `fix/floxum-audit-beta1` PR wholesale.
2. Branch from the last verified working commit for every focused fix; one concern per PR.
3. Run PHP syntax lint, JS build, and manual integration smoke tests. For cross-user features, use at least two Flarum accounts.
4. Before destructive operations or migrations: back up MariaDB, keep a Git commit/tag and independent repository backup.
5. Versioned releases are immutable tags. Store known issues and test results in the PR before merging.
6. **Never treat a successful JS build as proof that the extension works inside Flarum.**

## Current baseline

- Recovery branch: `recovery/last-working-audit-build` (commit `821d761`).
- Current beta.2 branch: `fix/beta2-core-stability`, initially based on recovery.
- Earlier combined audit PR #1 is a **draft with confirmed regressions**; use it only for isolated reference changes.
- In beta.2, avoid edits to grid/movement and avoid destructive map deletion; both have dedicated subsequent releases.
