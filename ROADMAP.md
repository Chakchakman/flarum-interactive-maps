# Interactive Maps — Roadmap

Status: working plan, agreed 2026-10-20. Versions are milestones, not release dates.
**Rule:** no release is tagged until its acceptance checks pass on Flarum 2.x. No schema migrations without a database backup.

## Current priorities — 2026-10-27

The owner passed the supplied Alpha.7 picker/composer/owner-search, presentation and player-permission checks on code `28bff5e`. Grid schema upgrade completed after a fresh backup. Automatic baseline: 43 JS tests, 14 browser scenarios and PHP/CI checks on `ca60b9e`; explicit GM grants, core private/hidden scopes, custom extension scopers and multiple embeds passed automatically. This is lab acceptance of the named scenarios, not release/merge authorization.

| Order | Work | Completion evidence |
| --- | --- | --- |
| 1 | Owner acceptance of v0.3 Alpha.2 (completed) | Conditional moves implemented on `6499c8d`; 55 JS / 23 browser, PHP and both CI workflows pass; owner confirmed all four supplied checks on cumulative e917eaa, including conflict/retry and background/network recovery |
| 2 | Finish v0.2/v0.3 release gates and prepare review | Existing owner-tested features retained; background-tab resume, device/theme checks, install/upgrade review and actual third-party privacy integration (if used) remain; release/merge requires owner decision |
| 3 | Agree remaining v0.3 scope | Alpha.1 sync owner-tested, Alpha.2 conflicts automatically tested; presence remains provisional and is not automatically authorized |
| 4 | Later agreed milestones | v0.4 measurement/markers; v0.5 image upload/layers; v0.6 fog of war; v0.7 session features; no expansion without scope agreement |

**Description maintenance:** for every minor version (0.1, 0.2, 0.3 and onward), refresh the main README description, features, limitations and verification/release statuses before preparing the version review. Owner instruction, 2026-10-27.

Zoom/pan were pulled forward and are implemented in both contexts; do not schedule their initial implementation again. Token circles, user avatars, owner autocomplete and grid styles are implemented and owner-tested, not future features. The 2026-10-27 owner instruction authorizes the first focused v0.3 synchronization step, below; it does not authorize release/merge.

Release preparation checklist: [RELEASE-CHECKLIST](docs/RELEASE-CHECKLIST.md). Owner authorized progress toward the final release and a performance audit on 2026-10-27. `feature/sync-performance` (`acabf2c`) eliminates redundant scoped reads and idle redraws without schema or UX changes. Cumulative `fix/build-dependency-audit` source `e917eaa` includes this optimization and fast-uri 3.1.9: 61 JS / 23 browser, PHP/Windows and npm/Composer audits passed, both CI workflows succeeded. Owner acceptance of the new build is pending; [commands and QA](docs/QA-v0.3-performance.md). New milestones remain separately reviewable; final release/merge approval and owner acceptance still apply.

## Historical stage 1 — Reliability of the first public release

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
- **v0.4.0:** measurement tools and map markers; pan/zoom in the editor and posts were pulled forward and are implemented.
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

## Historical beta baseline

- Recovery branch: `recovery/last-working-audit-build` (commit `821d761`).
- Current beta.2 branch: `fix/beta2-core-stability`, initially based on recovery.
- Earlier combined audit PR #1 is a **draft with confirmed regressions**; use it only for isolated reference changes.
- In beta.2, avoid edits to grid/movement and avoid destructive map deletion; both have dedicated subsequent releases.

### Owner-approved additions (2026-10-24)

Before further v0.3 work: add selection of a map in the new-discussion/reply composer, with atomic server publication and existing post-menu fallback; add staff-only token-owner autocomplete after three characters. Keep separate focused branches/PRs and real Flarum browser regression gates. These additions do not authorize active map BBCode, schema changes or a release.

### Requested presentation work (2026-10-25)

Focused follow-ups: circular token image fit; native user avatars in owner suggestions (confirmed meaning); per-map grid color/thickness. Preserve coordinates/permissions and verified composer/picker behavior. The style persistence migration must be reviewed and explicitly approved with a fresh DB backup before any existing forum upgrade. These requests do not authorize a release or automatic PR merges.


### v0.3 Alpha.1 in development — 2026-10-27

`feature/post-map-sync`: visible embedded boards share bounded token polling; actor-specific post privacy remains authoritative, local active writes and stale GETs are protected, network errors back off. No migrations/external realtime service. Final code `851f38b` passed 51 JS tests, 17 browser scenarios, PHP/Windows checks and both CI workflows; owner confirmed automatic cross-client movement and denial to the former owner after reassignment on 2026-10-27; background-tab manual checks remain separate. Exact runs and installation commands are tracked in PROJECT-CONTEXT and QA-v0.3-alpha1-post-sync. The next focused v0.3 work is competing-write conflict handling; presence remains provisional. Current last-committed-write semantics are not described as conflict protection.


### v0.3 Alpha.2 in development — 2026-10-27

`feature/token-move-conflicts`: current-state movement preconditions, transactional row locking and fresh ownership checks, stale-write rejection and explicit client recovery in post/editor. No schema migration. Old open tabs require refresh (428) before writes. Dedicated concurrency/ownership-race/active-drag tests supplement the Alpha.1 suite. Code `6499c8d`: 55 JS / 23 browser scenarios, PHP and Windows checks passed; runtime CI 40535360635 and Extension CI 40535360746 are successful. Owner acceptance is pending. See QA-v0.3-alpha2-move-conflicts. Presence and durable history remain future work.


### Proposed embed presentation follow-up — 2026-10-27

Owner requested above/below-text placement and spoiler-style collapse. [Design proposal](docs/EMBED-PRESENTATION-PLAN.md): per-attachment placement/default, viewer-local collapse and suspended polling while closed; existing defaults/rights preserved. Owner clarified that “map in a topic” means its first post, using the existing post association. This is not implemented and does not change the currently tested e917eaa build. Schema application remains subject to fresh backup and explicit approval.


### Owner-accepted baseline and approved follow-ups — 2026-10-27

e917eaa passed all four owner checks (ordinary forum/picker, conflict/retry, reassignment denial, background/network recovery). Release/merge is still a separate decision. Owner approved the presentation plan and requested generic creation placeholders plus local map background upload (pulled forward from v0.5). Implement these as focused branches; keep schema application subject to fresh backup/explicit approval. No other v0.5 layer/editor features are included.
