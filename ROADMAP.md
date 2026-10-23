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

### Preferred in-post attachment workflow (agreed 2026-10-23)

- Staff creates a map in the private library, then chooses **«Прикрепить карту»** from the menu of an **existing, editable post**; optionally copies a safe numeric marker from the map's **«Экспорт»** button and pastes it into that dialog.
- The attachment is a protected **database association**, not content injected into a BBCode post or an arbitrary iframe. This means prose can be edited independently, and **«Открепить карту»** never deletes the reusable map or its tokens.
- The menu action must remain invisible to ordinary players, while the API enforces permissions even for forged requests. Keep multiple-embed, hidden/private post and role regression tests.
- **Decision:** do **not** prioritize automatic BBCode/formatter parsing of map references inside the text of posts; user prefers the separate map-linking action. Next improvements should focus on polishing that flow, e.g. map picker/search in the attach dialog, not rewriting Flarum's composer.

### Future features (provisional)

- **v0.2.0:** **priority feature — embed interactive maps in discussion posts**, staff-only map catalog and configurable manage/embed permissions, server-validated per-post/per-discussion visibility, player move-own-token inside the post. This supersedes the earlier v0.7 embedding schedule.
- **v0.3.0:** multi-client token sync; collision/conflict handling and presence.
- **v0.4.0:** pan, zoom in **both embedded post maps and the staff map editor**, measurement tools and map markers.
- **v0.5.0:** image upload, map editor, overlays and layers.
- **v0.6.0:** fog of war, hidden tokens, visibility and conditions.
- **v0.7.0:** more advanced game sessions, scoped GM assignments and other Flarum integrations.
- **v1.0.0:** mature documentation, compatibility tests, release/upgrade guarantee.

### Map zoom and navigation — both contexts (v0.4.0; may be pulled forward after v0.2 player movement)

**Agreed UX (2026-10-23): a bounded viewport and a zoom slider, not +/- buttons.**

- **In-post board:** the map is displayed inside a consistently sized, responsive viewport, never expanding the discussion post to the image's native dimensions. Target design: width limited to the post content column, desktop maximum height around 420–500px, mobile around 260–320px; finalized values to be tuned in Flarum browser tests. The full map fits inside the viewport by default without cropping or distortion, including portrait, landscape and square backgrounds.
- **Zoom control:** one visible horizontal range slider with a percent readout and a clearly labeled **Fit / Reset** action; no primary `+` / `−` buttons. Start with a candidate 50–300% range relative to the image's *fit-to-viewport* scale; evaluate range/step with real maps. At 100%, the whole map fits; smaller scales center the map in the same viewport rather than shrinking its container.
- **Pan:** at larger-than-fit scales, pan *within the clipped viewport* by dragging an empty area, never by scrolling the whole discussion or resizing the post. Constrain panning to avoid losing the map completely outside the window; center maps smaller than the viewport.
- **Map editor:** same slider and clipped viewport logic, but allow a larger canvas or optional fullscreen workspace later; map editing controls remain separate from viewport navigation.
- **Token interactions:** dragging an owned token moves that token; dragging a free/background area pans. Mouse wheel should continue scrolling the forum normally (do not hijack it for zoom). On touchscreens, support panning and pinch-to-zoom without blocking normal vertical page scrolling when outside the map.
- **Geometry and persistence:** background image, SVG grid and every token share the *same transform* so cells and tokens align at every scale. Convert pointer coordinates back through the inverse transform when saving token positions; viewport zoom and offset are client-only, with no mutation of map dimensions, grid origin, saved token coordinates or user permissions.
- **Isolation:** each inline board and staff editor owns independent viewport zoom/pan state. Multiple maps in one discussion must not affect one another.
- **Acceptance / regression:** check small/large and portrait/square/landscape images, desktop/mobile and light/dark Flarum themes. Map never exceeds its post's horizontal bounds or chosen window height; no Mithril keyed-vnode mixing, lost posts/composer/BBCode controls, accidental token moves, scrolling traps, coordinate drift or unexpected API writes. Verify editor drag and post-scoped authorization with two separate accounts.

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
